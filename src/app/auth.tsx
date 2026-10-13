import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isPostgresBackend } from '@/data/backend'
import { fetchMe, type CurrentUser } from '@/lib/authApi'

export const AUTH_ME_QUERY_KEY = ['auth', 'me'] as const

/** Single source of truth for auth state — reads the session cookie via GET /auth/me. The
 *  Dataverse/Power-Platform-hosted build has no login backend at all — the query never runs
 *  there, and useAuth reports a fixed "signed in" stand-in so the rest of the app (e.g. an
 *  admin-only Admin tab) doesn't need its own separate branch for that build. */
function useMeQuery() {
  return useQuery<CurrentUser>({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
    enabled: isPostgresBackend,
  })
}

interface AuthState {
  user: CurrentUser | null
  isLoading: boolean
  /** Postgres backend only — the Dataverse build never gates anything on this. */
  authEnabled: boolean
  refresh: () => void
}

const STAND_IN_USER: CurrentUser = { id: 'dataverse', email: '', displayName: 'Power Platform host', isAdmin: true }

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useMeQuery()

  const value: AuthState = {
    user: isPostgresBackend ? (data ?? null) : STAND_IN_USER,
    isLoading: isPostgresBackend ? isLoading : false,
    authEnabled: isPostgresBackend,
    refresh: () => queryClient.invalidateQueries({ queryKey: AUTH_ME_QUERY_KEY }),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
