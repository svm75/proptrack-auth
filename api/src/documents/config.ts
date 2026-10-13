/**
 * NAS-native document storage - upload validation config. Extend ALLOWED_TYPES to add new
 * mime/extension pairs; both must match for a file to be accepted (belt-and-braces against a
 * spoofed Content-Type header or a spoofed extension alone).
 */

export const MAX_UPLOAD_BYTES = Number(process.env.DOCUMENTS_MAX_UPLOAD_BYTES || 25 * 1024 * 1024) // 25MB default

export interface AllowedType {
  mime: string
  extensions: string[]
}

export const ALLOWED_TYPES: AllowedType[] = [
  { mime: 'application/pdf', extensions: ['.pdf'] },
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'] },
  { mime: 'image/png', extensions: ['.png'] },
  { mime: 'application/vnd.ms-excel', extensions: ['.xls'] },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensions: ['.xlsx'] },
  { mime: 'application/msword', extensions: ['.doc'] },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['.docx'] },
]

const MIME_SET = new Set(ALLOWED_TYPES.map((t) => t.mime))
const EXT_SET = new Set(ALLOWED_TYPES.flatMap((t) => t.extensions))

export function isAllowedMime(mime: string): boolean {
  return MIME_SET.has(mime.toLowerCase())
}

export function isAllowedExtension(ext: string): boolean {
  return EXT_SET.has(ext.toLowerCase())
}
