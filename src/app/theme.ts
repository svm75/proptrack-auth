import { webLightTheme, webDarkTheme, type Theme } from '@fluentui/react-components'

// Teal brand ramp — PropTrack's own accent (it was the app's header color under the old
// Tailwind theme), built the same way Wealth Ledger builds its petrol-green ramp: override
// Fluent's brand tokens on top of the stock light/dark theme rather than hand-rolling one.
export const propTrackTheme: Theme = {
  ...webLightTheme,
  colorBrandBackground: '#0F766E',
  colorBrandBackgroundHover: '#0D9488',
  colorBrandBackgroundPressed: '#115E59',
  colorCompoundBrandBackground: '#0F766E',
  colorBrandForeground1: '#0F766E',
  colorBrandForegroundLink: '#0F766E',
}

export const propTrackThemeDark: Theme = {
  ...webDarkTheme,
  colorBrandBackground: '#14B8A6',
  colorBrandBackgroundHover: '#5EEAD4',
  colorBrandBackgroundPressed: '#0D9488',
  colorCompoundBrandBackground: '#14B8A6',
  colorBrandForeground1: '#5EEAD4',
  colorBrandForegroundLink: '#5EEAD4',
}

const STORAGE_KEY = 'pt-dark-mode'

export function getStoredDarkMode(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setStoredDarkMode(dark: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, dark ? '1' : '0')
  } catch {
    // localStorage unavailable — dark mode just won't persist across sessions
  }
}
