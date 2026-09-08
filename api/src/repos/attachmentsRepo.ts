import { makeCrudRepo } from './genericRepo.js'

export interface AttachmentRow {
  id: string
  file_name: string
  google_drive_id: string | null
  google_drive_url: string | null
  invoice_id: string | null
  property_id: string | null
  property_id_invoice: string | null
  contact_id: string | null
  attach_type_id: string | null
  reference_type: number | null
  uploaded_on: string | null
  // NAS-native document storage (final migration addendum, db/007_document_storage.sql).
  // NULL for legacy Google-Drive-only rows.
  storage_path: string | null
  original_filename: string | null
  stored_filename: string | null
  mime_type: string | null
  file_size: string | null // BIGINT comes back as string from `pg`
  created_at: string
  updated_at: string
}

export const attachmentsRepo = makeCrudRepo<AttachmentRow>('attachments', [
  'file_name', 'google_drive_id', 'google_drive_url', 'invoice_id', 'property_id',
  'property_id_invoice', 'contact_id', 'attach_type_id', 'reference_type', 'uploaded_on',
  'storage_path', 'original_filename', 'stored_filename', 'mime_type', 'file_size',
])
