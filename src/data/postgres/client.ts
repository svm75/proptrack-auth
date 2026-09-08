/**
 * Thin `fetch` wrapper for the new PostgreSQL-backed API (`api/`), mirroring the shape of
 * `src/data/dataverse/dataverseRepositories.ts` at the call-site level (migration.md §API
 * Architecture / §Frontend adapter). NOT wired into the running app by default — see
 * `src/data/index.ts`. Configure via Vite env vars:
 *   VITE_API_BASE_URL   e.g. http://localhost:8787
 *   VITE_API_AUTH_TOKEN  shared bearer token (matches api/.env's API_AUTH_TOKEN)
 */

function baseUrl(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env ?? {}
  return env.VITE_API_BASE_URL || 'http://localhost:8787'
}

function authToken(): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any).env ?? {}
  return env.VITE_API_AUTH_TOKEN
}

export class ApiRequestError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string>) } })
  if (!res.ok) {
    let body: unknown
    try { body = await res.json() } catch { body = await res.text().catch(() => undefined) }
    throw new ApiRequestError(res.status, body)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: (path: string) => request<void>(path, { method: 'DELETE' }),
}
