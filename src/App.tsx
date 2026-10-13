import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { FluentProvider, Spinner } from '@fluentui/react-components'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/hooks/queryClient'
import { propTrackTheme, propTrackThemeDark, getStoredDarkMode } from '@/app/theme'
import { DarkModeContext } from '@/app/darkMode'
import { Shell } from '@/app/Shell'
import { AppRoutes } from '@/app/routes'
import { UnsavedChangesProvider } from '@/app/unsavedChanges'
import { AuthProvider, useAuth } from '@/app/auth'
import Login from '@/screens/Login'

/** Gates the whole app on a signed-in session on the Postgres backend; the Dataverse build's
 *  stand-in user (see src/app/auth.tsx) always passes through, unchanged from before this
 *  feature. */
function AuthGate({ children }: { children: ReactNode }) {
  const { user, isLoading, authEnabled } = useAuth()
  if (authEnabled && isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spinner label="Loading…" />
      </div>
    )
  }
  if (authEnabled && !user) return <Login />
  return <>{children}</>
}

export default function App() {
  const [dark, setDark] = useState(getStoredDarkMode)

  useEffect(() => {
    document.body.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])

  return (
    <DarkModeContext.Provider value={{ dark, setDark }}>
      <FluentProvider theme={dark ? propTrackThemeDark : propTrackTheme}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthGate>
              <BrowserRouter>
                <UnsavedChangesProvider>
                  <Shell>
                    <AppRoutes />
                  </Shell>
                </UnsavedChangesProvider>
              </BrowserRouter>
            </AuthGate>
          </AuthProvider>
        </QueryClientProvider>
      </FluentProvider>
    </DarkModeContext.Provider>
  )
}
