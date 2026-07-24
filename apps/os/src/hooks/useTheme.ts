/**
 * @file useTheme.ts
 * @description Small hook that manages the app's light/dark theme.
 *
 * The design system already defines a full `.dark` CSS variable set in
 * shadcn.css, but nothing in the app ever toggled it — so dark mode was
 * unreachable. This hook:
 * - Reads a saved preference from localStorage, falling back to the OS-level
 *   `prefers-color-scheme` on first load.
 * - Applies/removes the `dark` class on <html>, which is what every themed
 *   color variable in shadcn.css keys off (`.dark { ... }` / Tailwind's
 *   `darkMode: ['class']`).
 * - Persists the choice so it survives reloads.
 */

import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'fleurstales:theme'

/**
 * @description Resolves the theme to use on first render: a saved
 * preference if one exists, otherwise the OS-level color scheme.
 */
const getInitialTheme = (): Theme => {
  if (typeof window === 'undefined') return 'light'

  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved

  const prefersDark = window.matchMedia?.(
    '(prefers-color-scheme: dark)',
  ).matches
  return prefersDark ? 'dark' : 'light'
}

/**
 * @description Provides the current theme plus setters, and keeps the
 * `dark` class on <html> in sync with it.
 */
export const useTheme = () => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])

  const toggleTheme = useCallback(
    () => setThemeState((current) => (current === 'dark' ? 'light' : 'dark')),
    [],
  )

  return { theme, setTheme, toggleTheme }
}
