import express from 'express'
import multer from 'multer'
import { promises as fs, createReadStream } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {
  DOCUMENTS_ROOT, resolveRelativePath, assertRealPathInsideRoot, assertParentRealPathInsideRoot,
  sanitizeFilename,
} from '../documents/paths.js'
import { MAX_UPLOAD_BYTES, isAllowedMime, isAllowedExtension } from '../documents/config.js'
import { attachmentsRepo, type AttachmentRow } from '../repos/attachmentsRepo.js'
import { ApiError, NotFoundError, ValidationError } from '../errors.js'

/**
 * NAS-native document storage routes (final migration addendum). Mounted under /documents in
 * app.ts, behind the same requireToken gate as every other route. The API is the ONLY component
 * that touches the filesystem - every path here is resolved via api/src/documents/paths.ts,
 * never trusted directly from the request.
 */

export const documentsRouter = express.Router()

// multer memoryStorage: files are buffered in memory (bounded by MAX_UPLOAD_BYTES) then written
// to their validated destination ourselves - keeps multer out of the path-resolution/validation
// decision entirely, so there is exactly one place (documents/paths.ts) that decides where a
// file may land.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
})

function toPublicEntry(name: string, relBase: string) {
  const relPath = relBase ? `${relBase}/${name}` : name
  return { path: relPath, name }
}

// ---------- GET /documents/folders?path=<relative> ----------
// Lists subfolders (and files, tagged) under a validated relative path. Never returns a
// filesystem path - only { path, name } relative to DOCUMENTS_ROOT.
documentsRouter.get('/folders', async (req, res, next) => {
  try {
    const raw = typeof req.query.path === 'string' ? req.query.path : ''
    const { relative, absolute } = resolveRelativePath(raw)

    await fs.mkdir(DOCUMENTS_ROOT, { recursive: true })
    let real: string
    try {
      real = await assertRealPathInsideRoot(absolute)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        // Folder doesn't exist yet - not an error, just empty (e.g. a property with no
        // documents uploaded yet). Browsing should not require pre-creating folders.
        res.json({ path: relative, folders: [], files: [] })
        return
      }
      throw err
    }

    const entries = await fs.readdir(real, { withFileTypes: true })
    const folders = entries.filter((e) => e.isDirectory()).map((e) => toPublicEntry(e.name, relative)).sort((a, b) => a.name.localeCompare(b.name))
    const files = entries.filter((e) => e.isFile()).map((e) => toPublicEntry(e.name, relative)).sort((a, b) => a.name.localeCompare(b.name))
    res.json({ path: relative, folders, files })
  } catch (err) {
    next(err)
  }
})

// ---------- POST /documents/folders ----------
// Body: { path: string, name: string } - creates <path>/<name> under DOCUMENTS_ROOT.
documentsRouter.post('/folders', async (req, res, next) => {
  try {
    const { path: parentPath, name } = req.body ?? {}
    if (typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('Folder name is required.')
    }
    if (/[/\\]/.test(name)) {
      throw new ValidationError('Folder name must not contain path separators.')
    }
    const combined = parentPath ? `${parentPath}/${name}` : name
    const { relative, absolute } = resolveRelativePath(combined)

    await assertParentRealPathInsideRoot(absolute)
    await fs.mkdir(absolute, { recursive: true })
    res.status(201).json({ path: relative, name: path.basename(relative) })
  } catch (err) {
    next(err)
  }
})

// ---------- POST /documents/upload ----------
// multipart/form-data: field "file" (the file), field "path" (destination folder, relative),
// plus optional metadata fields mirrored onto the attachments row: propertyId, invoiceId,
// contactId, attachTypeId, referenceType.
documentsRouter.post('/upload', upload.single('file'), async (req, res, next) => {
  const file = req.file
  let writtenAbsolutePath: string | null = null
  try {
    if (!file) {
      throw new ValidationError('No file uploaded (expected multipart field "file").')
    }

    const destInput = typeof req.body.path === 'string' ? req.body.path : ''
    const { relative: destRelative, absolute: destAbsolute } = resolveRelativePath(destInput)
    await assertParentRealPathInsideRoot(destAbsolute) // dest folder's parent must be inside root...
    await fs.mkdir(destAbsolute, { recursive: true })
    await assertRealPathInsideRoot(destAbsolute) // ...and the (now-existing) dest folder itself, following any symlink

    const ext = path.extname(file.originalname).toLowerCase()
    const mime = file.mimetype
    if (!isAllowedExtension(ext) || !isAllowedMime(mime)) {
      throw new ValidationError(`File type not allowed: "${ext || '(no extension)'}" / "${mime}". Allowed: PDF, JPG/JPEG, PNG, XLS/XLSX, DOC/DOCX.`)
    }
    if (file.size === 0) {
      throw new ValidationError('Uploaded file is empty.')
    }

    const storedFilename = `${crypto.randomUUID()}${ext}` // UUID-based -> collision-safe by construction, never overwrites
    const storedAbsolute = path.join(destAbsolute, storedFilename)
    const storedRelative = destRelative ? `${destRelative}/${storedFilename}` : storedFilename

    await fs.writeFile(storedAbsolute, file.buffer, { flag: 'wx' }) // 'wx' = fail if it somehow already exists, never silently overwrite
    writtenAbsolutePath = storedAbsolute

    const originalFilename = sanitizeFilename(file.originalname)

    let row: AttachmentRow
    try {
      row = await attachmentsRepo.create({
        file_name: originalFilename,
        storage_path: storedRelative,
        original_filename: originalFilename,
        stored_filename: storedFilename,
        mime_type: mime,
        file_size: String(file.size),
        property_id: req.body.propertyId || null,
        invoice_id: req.body.invoiceId || null,
        contact_id: req.body.contactId || null,
        attach_type_id: req.body.attachTypeId || null,
        reference_type: req.body.referenceType ? Number(req.body.referenceType) : null,
        uploaded_on: new Date().toISOString(),
      })
    } catch (dbErr) {
      // DB write failed after the file write succeeded - delete the just-written file so the
      // filesystem never holds an orphaned file with no metadata row (§2 upload consistency rule).
      await fs.unlink(storedAbsolute).catch(() => { /* best-effort cleanup */ })
      writtenAbsolutePath = null
      throw dbErr
    }

    res.status(201).json(row)
  } catch (err) {
    next(err)
  }
})

// ---------- GET /documents/:id ----------
// Streams the file back with the original filename and correct Content-Type. A row with no
// storage_path has no NAS-side file to stream (pre-dates NAS document storage) - 404.
documentsRouter.get('/:id', async (req, res, next) => {
  try {
    const row = await attachmentsRepo.get(req.params.id)
    if (!row) throw new NotFoundError('Attachment not found.')
    if (!row.storage_path) {
      throw new NotFoundError('This attachment has no NAS-stored file.')
    }

    const { absolute } = resolveRelativePath(row.storage_path)
    let real: string
    try {
      real = await assertRealPathInsideRoot(absolute)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') throw new NotFoundError('Stored file is missing on disk.')
      throw err
    }

    const stat = await fs.stat(real)
    const displayName = row.original_filename || row.file_name || 'download'
    res.setHeader('Content-Type', row.mime_type || 'application/octet-stream')
    res.setHeader('Content-Length', String(stat.size))
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(displayName)}"`)
    createReadStream(real).on('error', next).pipe(res)
  } catch (err) {
    next(err)
  }
})

// ---------- DELETE /documents/:id ----------
// Removes the physical file (if present) and the metadata row. If the file is already missing
// on disk, the metadata row is still removed (it would otherwise be a permanently orphaned,
// unusable record) but the response reports the discrepancy via a `warning` field rather than
// silently claiming a clean delete - documented choice, see migration.md addendum §2.
documentsRouter.delete('/:id', async (req, res, next) => {
  try {
    const row = await attachmentsRepo.get(req.params.id)
    if (!row) throw new NotFoundError('Attachment not found.')

    let warning: string | undefined
    if (row.storage_path) {
      const { absolute } = resolveRelativePath(row.storage_path)
      try {
        const real = await assertRealPathInsideRoot(absolute)
        await fs.unlink(real)
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          warning = 'Physical file was already missing on disk; removed metadata only.'
        } else if (err instanceof ApiError) {
          throw err
        } else {
          throw err
        }
      }
    }

    await attachmentsRepo.remove(req.params.id)
    res.json({ deleted: true, id: req.params.id, ...(warning ? { warning } : {}) })
  } catch (err) {
    next(err)
  }
})
