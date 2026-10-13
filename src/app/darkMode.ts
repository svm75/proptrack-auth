import { createContext, useContext } from 'react'
import { setStoredDarkMode } from './theme'

interface DarkModeCtx {
  dark: boolean
  setDark: (dark: boolean) => void
}

export const DarkModeContext = createContext<DarkModeCtx>({ dark: false, setDark: () => {} })

export function useDarkMode() {
  const ctx = useContext(DarkModeContext)
  return {
    dark: ctx.dark,
    toggle: () => {
      const next = !ctx.dark
      setStoredDarkMode(next)
      ctx.setDark(next)
    },
  }
}
