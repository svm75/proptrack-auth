/**
 * Frontend client for the shared single sign-on session (api/src/auth.ts) — the same login/
 * session cookie works across every app on the NAS (Wealth Ledger, PropTrack, OmniHub, ...);
 * this file only ever talks to THIS app's own `/auth/*` routes, which read/write the one shared
 * `identity` database directly. Postgres-backend only, like src/services/documents.ts. Managing
 * users (add/remove/reset someone else's password) lives in Control Deck now, not here.
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

export interface CurrentUser {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string } | null
    throw new Error(body?.message || `Request failed (${res.status}).`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = authToken()
  return fetch(`${baseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  }).then(handle<T>)
}

export const login = (email: string, password: string) =>
  request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })

export const logout = () => request<void>('/auth/logout', { method: 'POST' })

export const fetchMe = () => request<CurrentUser>('/auth/me')

export const changeOwnPassword = (currentPassword: string, newPassword: string) =>
  request<void>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) })
