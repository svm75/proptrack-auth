/**
 * NAS-native document storage — frontend client. Talks to the `/documents` API routes
 * (api/src/routes/documentsRoutes.ts), mirroring the conventions of src/data/postgres/client.ts.
 * This is the only document-storage mechanism in the production build — Google Drive has been
 * removed entirely (see docs/ARCHITECTURE.md "Google Drive removal"); production held zero
 * attachment rows referencing it. Only used when this build is wired to the Postgres/NAS backend
 * (src/data/backend.ts's isPostgresBackend) — the legacy Power Platform build shows a disabled
 * upload message instead of calling this module.
 */

function apiBaseUrl(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env ?? {}
  return env.VITE_API_BASE_URL || 'http://localhost:8787'
}

function authToken(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env ?? {}
  return env.VITE_API_AUTH_TOKEN
}

function authHeaders(): Record<string, string> {
  const token = authToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export interface FolderEntry { path: string; name: string }
export interface FolderListing { path: string; folders: FolderEntry[]; files: FolderEntry[] }

export interface DocumentRow {
  id: string
  file_name: string
  storage_path: string | null
  original_filename: string | null
  mime_type: string | null
  file_size: string | null
  property_id: string | null
  invoice_id: string | null
  contact_id: string | null
  attach_type_id: string | null
  uploaded_on: string | null
  category_id: string | null
  valid_from_date: string | null
  expiry_date: string | null
  description: string | null
  tags: string[] | null
  period_year: number | null
  supplier_contract_id: string | null
  comment: string | null
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown
    try { body = await res.json() } catch { body = await res.text().catch(() => undefined) }
    const message = (body && typeof body === 'object' && 'message' in body) ? String((body as { message: unknown }).message) : `Request failed (${res.status})`
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function listFolders(path = ''): Promise<FolderListing> {
  const res = await fetch(`${apiBaseUrl()}/documents/folders?path=${encodeURIComponent(path)}`, {
    credentials: 'include',
    headers: authHeaders(),
  })
  return handle<FolderListing>(res)
}

export async function createFolder(path: string, name: string): Promise<FolderEntry> {
  const res = await fetch(`${apiBaseUrl()}/documents/folders`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ path, name }),
  })
  return handle<FolderEntry>(res)
}

export interface UploadMeta {
  path: string
  /** Mandatory — a Document Category reference_data id (reference_type 233100007). */
  categoryId: string
  /** Mandatory, YYYY-MM-DD — also drives the stored filename's yyyymmdd_ prefix. */
  validFromDate: string
  expiryDate?: string
  description?: string
  tags?: string[]
  periodYear?: number
  supplierContractId?: string
  comment?: string
  propertyId?: string
  invoiceId?: string
  contactId?: string
  attachTypeId?: string
  referenceType?: number
}

export async function uploadDocument(file: File, meta: UploadMeta): Promise<DocumentRow> {
  const form = new FormData()
  form.append('file', file)
  form.append('path', meta.path)
  form.append('categoryId', meta.categoryId)
  form.append('validFromDate', meta.validFromDate)
  if (meta.expiryDate) form.append('expiryDate', meta.expiryDate)
  if (meta.description) form.append('description', meta.description)
  if (meta.tags?.length) form.append('tags', meta.tags.join(','))
  if (meta.periodYear !== undefined) form.append('periodYear', String(meta.periodYear))
  if (meta.supplierContractId) form.append('supplierContractId', meta.supplierContractId)
  if (meta.comment) form.append('comment', meta.comment)
  if (meta.propertyId) form.append('propertyId', meta.propertyId)
  if (meta.invoiceId) form.append('invoiceId', meta.invoiceId)
  if (meta.contactId) form.append('contactId', meta.contactId)
  if (meta.attachTypeId) form.append('attachTypeId', meta.attachTypeId)
  if (meta.referenceType !== undefined) form.append('referenceType', String(meta.referenceType))

  const res = await fetch(`${apiBaseUrl()}/documents/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: authHeaders(), // no Content-Type — the browser sets the multipart boundary
    body: form,
  })
  return handle<DocumentRow>(res)
}

export async function moveDocument(id: string, path: string): Promise<DocumentRow> {
  const res = await fetch(`${apiBaseUrl()}/documents/${id}/move`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ path }),
  })
  return handle<DocumentRow>(res)
}

/** Direct download URL (used for `<a href>`/`window.open`, not a `fetch` — no auth header
 * possible on a plain navigation, so the API's requireToken gate must be satisfied some other
 * way for this to work outside dev-mode-no-token; acceptable for this single-tenant, private
 * network app per migration.md §Authentication, matching how googleDriveUrl links already work). */
export function documentDownloadUrl(id: string): string {
  return `${apiBaseUrl()}/documents/${id}`
}

/** Same file, but the API sets Content-Disposition: inline — for the Documents tab's preview
 *  pane (PDF/image embeds), which should render in place, not trigger a save dialog. */
export function documentPreviewUrl(id: string): string {
  return `${apiBaseUrl()}/documents/${id}?inline=1`
}

export async function downloadDocumentBlob(id: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${apiBaseUrl()}/documents/${id}`, { credentials: 'include', headers: authHeaders() })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = /filename="([^"]*)"/.exec(disposition)
  const filename = match ? decodeURIComponent(match[1]) : 'download'
  const blob = await res.blob()
  return { blob, filename }
}

export async function deleteDocument(id: string): Promise<{ deleted: boolean; warning?: string }> {
  const res = await fetch(`${apiBaseUrl()}/documents/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: authHeaders(),
  })
  return handle<{ deleted: boolean; warning?: string }>(res)
}
