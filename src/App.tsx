import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { FluentProvider } from '@fluentui/react-components'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/hooks/queryClient'
import { propTrackTheme, propTrackThemeDark, getStoredDarkMode } from '@/app/theme'
import { DarkModeContext } from '@/app/darkMode'
import { Shell } from '@/app/Shell'
import { AppRoutes } from '@/app/routes'

export default function App() {
  const [dark, setDark] = useState(getStoredDarkMode)

  useEffect(() => {
    document.body.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])

  return (
    <DarkModeContext.Provider value={{ dark, setDark }}>
      <FluentProvider theme={dark ? propTrackThemeDark : propTrackTheme}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <Shell>
              <AppRoutes />
            </Shell>
          </BrowserRouter>
        </QueryClientProvider>
      </FluentProvider>
    </DarkModeContext.Provider>
  )
}
