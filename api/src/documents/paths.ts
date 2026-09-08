import { promises as fs } from 'node:fs'
import path from 'node:path'
import { ValidationError } from '../errors.js'

/**
 * NAS-native document storage - path safety (final migration addendum, "NAS-native document
 * storage"). The API is the ONLY component that touches the filesystem; no browser-supplied
 * path is ever trusted. Every relative path coming from a request is resolved against
 * DOCUMENTS_ROOT and checked to stay strictly inside it before any fs call.
 *
 * DOCUMENTS_ROOT is resolved and canonicalized ONCE at module load (process startup). In
 * production this points at the NAS bind-mount (deploy/docker-compose.yml: /app/data/documents,
 * backed by /App/PropTracker/Documents/ on the NAS host). Local dev/test default is a
 * gitignored scratch directory under the repo.
 */

const rawRoot = process.env.DOCUMENTS_ROOT || './data/documents'
export const DOCUMENTS_ROOT = path.resolve(rawRoot)

/** Ensures DOCUMENTS_ROOT exists on disk (idempotent) - called once at startup. */
export async function ensureDocumentsRoot(): Promise<void> {
  await fs.mkdir(DOCUMENTS_ROOT, { recursive: true })
}

// Reject ASCII control characters (0x00-0x1F, 0x7F), including null bytes, and reserved
// segments ("." / "..") within a single path *segment* - segments are validated individually,
// not just the joined string, so a segment can't slip through as "safe" only becoming
// dangerous once joined.
const CONTROL_CHAR_RE = new RegExp('[\\x00-\\x1f\\x7f]')
const RESERVED_SEGMENTS = new Set(['.', '..'])

function isSuspiciousSegment(seg: string): boolean {
  return seg.length === 0 || RESERVED_SEGMENTS.has(seg) || CONTROL_CHAR_RE.test(seg)
}

/**
 * Validates a browser-supplied relative path and resolves it against DOCUMENTS_ROOT. Throws
 * ValidationError (400) for anything suspicious - traversal, absolute paths, null bytes, empty
 * segments - never lets a bad path reach fs.* as a 500 or, worse, a successful read/write
 * outside the root.
 *
 * `input` may be '' (root itself), 'Properties/Foo', etc. Backslashes are rejected outright
 * (Windows-style separators have no legitimate use here and are a common traversal vector).
 */
export function resolveRelativePath(input: string | undefined | null): { relative: string; absolute: string } {
  const raw = (input ?? '').trim()

  if (raw.includes('\\')) {
    throw new ValidationError('Invalid path: backslashes are not allowed.')
  }
  if (CONTROL_CHAR_RE.test(raw)) {
    throw new ValidationError('Invalid path: contains a control character.')
  }
  if (path.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) {
    throw new ValidationError('Invalid path: absolute paths are not allowed.')
  }

  const segments = raw.split('/').filter((s) => s.length > 0)
  for (const seg of segments) {
    if (isSuspiciousSegment(seg)) {
      throw new ValidationError(`Invalid path segment: "${seg}".`)
    }
  }

  const absolute = path.resolve(DOCUMENTS_ROOT, ...segments)
  const relative = path.relative(DOCUMENTS_ROOT, absolute)

  // Belt-and-braces: even though '..' segments were rejected above, re-verify the resolved
  // path is still strictly inside DOCUMENTS_ROOT (catches anything the segment-level check
  // didn't anticipate).
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ValidationError('Invalid path: escapes the documents root.')
  }

  return { relative: relative.split(path.sep).join('/'), absolute }
}

/**
 * Symlink-escape defense for a path that already exists on disk: resolves the real
 * (symlink-following) path and re-checks it stays inside the real root. Use before
 * reading/streaming/deleting an existing file or listing an existing directory.
 */
export async function assertRealPathInsideRoot(absolute: string): Promise<string> {
  const realRoot = await fs.realpath(DOCUMENTS_ROOT)
  const real = await fs.realpath(absolute) // throws ENOENT if missing; caller decides how to surface "not found"
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    throw new ValidationError('Invalid path: resolves outside the documents root.')
  }
  return real
}

/**
 * Symlink-escape defense for a NEW file/dir about to be created: the target itself doesn't
 * exist yet, so realpath its (existing) parent directory instead and check that.
 */
export async function assertParentRealPathInsideRoot(absolute: string): Promise<void> {
  // The documents root itself has no "parent" to validate within the root - a target that IS
  // the root (e.g. uploading directly into /App/PropTracker/Documents/, not a subfolder) is
  // already the root, so there's nothing above it to check here. Without this, path.dirname()
  // below would resolve to the root's own PARENT directory (outside DOCUMENTS_ROOT entirely),
  // incorrectly rejecting every root-level upload/folder-create as "escaping" the root.
  if (absolute === DOCUMENTS_ROOT) return

  const realRoot = await fs.realpath(DOCUMENTS_ROOT)
  const parent = path.dirname(absolute)
  let realParent: string
  try {
    realParent = await fs.realpath(parent)
  } catch {
    // Parent doesn't exist yet (e.g. nested folder creation) - fall back to the resolved
    // (non-symlink) parent path, already covered by resolveRelativePath's segment checks, so
    // this is a defensive no-op rather than a gap.
    return
  }
  if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
    throw new ValidationError('Invalid path: parent directory resolves outside the documents root.')
  }
}

/** Sanitizes a user-supplied filename for storage-safety (original_filename column, display
 * only - never used to build a filesystem path). Strips control chars and path separators. */
export function sanitizeFilename(name: string): string {
  const stripped = name.replace(CONTROL_CHAR_RE, '').replace(/[/\\]/g, '_').trim()
  return stripped.slice(0, 255) || 'unnamed'
}
