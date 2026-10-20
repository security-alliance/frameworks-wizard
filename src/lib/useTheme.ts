import { useCallback, useEffect, useState } from 'react'

const KEY = 'fw-theme'

export type Theme = 'dark' | 'light'

// Dark is the default (matching the live docs), but the contributor's stored
// choice wins. The initial value is already applied to <html> by the inline
// script in index.html — this hook just keeps React in sync with it.
function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(read)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // The preview renders the docs site's own components, and their CSS keys
    // dark mode off `:root[data-vocs-theme='dark']` — the attribute Vocs sets
    // on the live site. Without stamping it too, every imported stylesheet
    // would take its light-mode branch while the wizard sits in dark.
    document.documentElement.dataset.vocsTheme = theme
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // Private browsing / storage disabled — the theme still applies for
      // this session, it just won't be remembered.
    }
  }, [theme])

  const toggle = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  return { theme, toggle }
}
