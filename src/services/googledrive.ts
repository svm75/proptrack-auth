const CLIENT_ID     = import.meta.env.VITE_GOOGLE_CLIENT_ID     as string
const CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string
const REDIRECT_URI  = import.meta.env.VITE_GOOGLE_REDIRECT_URI  as string
const SCOPE         = 'https://www.googleapis.com/auth/drive.file'

const KEY_TOKEN   = 'gd_access_token'
const KEY_EXPIRY  = 'gd_token_expiry'
const KEY_REFRESH = 'gd_refresh_token'

// ---------- raw XHR (bypasses any fetch interceptor the Power Apps runtime installs) ----------

interface XhrResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

function xhrRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string | URLSearchParams | FormData | null,
): Promise<XhrResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.onload = () => {
      let parsed: unknown
      try { parsed = JSON.parse(xhr.responseText) } catch { parsed = xhr.responseText }
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: () => Promise.resolve(parsed),
      })
    }
    xhr.onerror  = () => reject(new Error('Network error'))
    xhr.ontimeout = () => reject(new Error('Request timed out'))
    xhr.send(body ?? null)
  })
}

// ---------- token storage ----------

function saveToken(data: { access_token: string; expires_in: number; refresh_token?: string }) {
  sessionStorage.setItem(KEY_TOKEN,  data.access_token)
  sessionStorage.setItem(KEY_EXPIRY, String(Date.now() + data.expires_in * 1000 - 60_000))
  if (data.refresh_token) sessionStorage.setItem(KEY_REFRESH, data.refresh_token)
}

function cachedToken(): string | null {
  const token  = sessionStorage.getItem(KEY_TOKEN)
  const expiry = Number(sessionStorage.getItem(KEY_EXPIRY) ?? 0)
  return token && Date.now() < expiry ? token : null
}

async function refreshAccessToken(): Promise<string | null> {
  const rt = sessionStorage.getItem(KEY_REFRESH)
  if (!rt) return null
  try {
    const res = await xhrRequest(
      'https://oauth2.googleapis.com/token',
      'POST',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      new URLSearchParams({
        client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
        refresh_token: rt, grant_type: 'refresh_token',
      }),
    )
    if (!res.ok) return null
    const data = await res.json() as { access_token: string; expires_in: number }
    saveToken(data)
    return data.access_token
  } catch {
    return null
  }
}

// ---------- OAuth popup ----------

/** True when a non-expired access token is already in sessionStorage. */
export function isAuthorized(): boolean {
  return cachedToken() !== null
}

/**
 * Opens the Google consent popup synchronously then exchanges the code.
 * MUST be called directly from a user-gesture handler (e.g. button onClick)
 * so that window.open is not blocked by the browser. The popup is opened
 * before the first await, which keeps it within the user-gesture context.
 */
export async function authorizeWithPopup(): Promise<string> {
  // window.open runs synchronously here — still inside the user-gesture tick.
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })
  const popup = window.open(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    'gd_oauth',
    'width=500,height=650,left=200,top=80',
  )

  // Everything after this point is async — popup is already open.
  const code = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error('Google sign-in timed out.')) }, 300_000)

    function handler(ev: MessageEvent) {
      if (ev.data?.type !== 'gd_oauth_code') return
      cleanup()
      ev.data.error ? reject(new Error(ev.data.error)) : resolve(ev.data.code as string)
    }

    const poll = setInterval(() => {
      if (popup?.closed) { cleanup(); reject(new Error('Sign-in window was closed.')) }
    }, 800)

    function cleanup() {
      clearTimeout(timeout); clearInterval(poll)
      window.removeEventListener('message', handler)
      popup?.close()
    }

    window.addEventListener('message', handler)
  })

  const res = await xhrRequest(
    'https://oauth2.googleapis.com/token',
    'POST',
    { 'Content-Type': 'application/x-www-form-urlencoded' },
    new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  )
  if (!res.ok) {
    const err = await res.json() as { error_description?: string }
    throw new Error(err.error_description ?? 'Token exchange failed.')
  }
  const data = await res.json() as { access_token: string; expires_in: number; refresh_token?: string }
  saveToken(data)
  return data.access_token
}

/**
 * Returns a valid access token using only silent methods (cache + refresh token).
 * Never opens a popup. Throws if no token is available.
 */
export async function authorize(): Promise<string> {
  const cached = cachedToken()
  if (cached) return cached

  const refreshed = await refreshAccessToken()
  if (refreshed) return refreshed

  throw new Error('Not authenticated with Google Drive. Please connect first.')
}

// ---------- folder helpers ----------

async function findFolder(name: string, parentId: string, token: string): Promise<string | null> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const res = await xhrRequest(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
    'GET',
    { Authorization: `Bearer ${token}` },
  )
  if (!res.ok) throw new Error('Drive folder search failed.')
  const data = await res.json() as { files: { id: string }[] }
  return data.files?.[0]?.id ?? null
}

async function createFolder(name: string, parentId: string, token: string): Promise<string> {
  const res = await xhrRequest(
    'https://www.googleapis.com/drive/v3/files',
    'POST',
    { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  )
  if (!res.ok) throw new Error('Drive folder creation failed.')
  const data = await res.json() as { id: string }
  return data.id
}

/** Traverse/create the full path and return the leaf folder ID. */
export async function getOrCreateFolder(path: string[]): Promise<string> {
  const token = await authorize()
  let parentId = 'root'
  for (const segment of path) {
    const safe = segment.replace(/[/\\:*?"<>|]/g, '-').trim()
    const existing = await findFolder(safe, parentId, token)
    parentId = existing ?? await createFolder(safe, parentId, token)
  }
  return parentId
}

// ---------- file operations ----------

export async function uploadFile(
  file: File,
  folderId: string,
): Promise<{ id: string; webViewLink: string }> {
  const token = await authorize()

  // Multipart upload via XHR with manually constructed body
  const boundary = `boundary_${Date.now().toString(36)}`
  const metadata = JSON.stringify({ name: file.name, parents: [folderId] })

  const fileBuffer = await file.arrayBuffer()

  // Build multipart body as a Blob so binary file data is preserved
  const metaPart = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata, '\r\n',
  ].join('')
  const filePart = `--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`
  const closing  = `\r\n--${boundary}--`

  const body = new Blob([
    new TextEncoder().encode(metaPart),
    new TextEncoder().encode(filePart),
    fileBuffer,
    new TextEncoder().encode(closing),
  ])

  const res = await xhrRequest(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    'POST',
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body as unknown as FormData,  // XHR accepts Blob as body
  )
  if (!res.ok) throw new Error('Drive upload failed.')
  return res.json() as Promise<{ id: string; webViewLink: string }>
}

export async function deleteFile(fileId: string): Promise<void> {
  const token = await authorize()
  const res = await xhrRequest(
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    'DELETE',
    { Authorization: `Bearer ${token}` },
  )
  if (!res.ok && res.status !== 404) throw new Error('Drive delete failed.')
}

// ---------- folder path builders ----------

export function invoiceFolderPath(
  propertyName: string,
  shortId: string,
  internalId: string,
): string[] {
  const propFolder = `${propertyName} (${shortId})`
  const safeId = internalId.replace(/\//g, '-')
  return ['PropTrack', propFolder, 'Invoices', safeId]
}

export function propertyFolderPath(propertyName: string, shortId: string): string[] {
  return ['PropTrack', `${propertyName} (${shortId})`, 'Property Docs']
}
