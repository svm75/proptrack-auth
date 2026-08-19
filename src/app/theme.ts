import { webLightTheme, webDarkTheme, type Theme } from '@fluentui/react-components'

// "Anthracite / carbon / off-white" identity — see docs/layout.md for the full spec.
// Anthracite (RAL 7016) is the primary accent; Royal Blue is kept as a separate
// informational/link accent since anthracite-on-white doesn't read as clickable.
export const propTrackTheme: Theme = {
  ...webLightTheme,
  colorBrandBackground: '#2F3538',
  colorBrandBackgroundHover: '#262B2D',
  colorBrandBackgroundPressed: '#1D2122',
  colorCompoundBrandBackground: '#2F3538',
  colorBrandForeground1: '#2F3538',
  colorBrandForegroundLink: '#2563EB',
  colorNeutralBackground1: '#FFFFFF', // cards
  colorNeutralBackground2: '#F8F9FA', // page
}

// Anthracite nearly disappears against a dark background, so dark mode lifts the
// accent to a lighter, still-desaturated neutral instead of just brightening the hue.
export const propTrackThemeDark: Theme = {
  ...webDarkTheme,
  colorBrandBackground: '#94A3B8',
  colorBrandBackgroundHover: '#B0BCC9',
  colorBrandBackgroundPressed: '#7C8896',
  colorCompoundBrandBackground: '#94A3B8',
  colorBrandForeground1: '#94A3B8',
  colorBrandForegroundLink: '#5B9BF5',
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
