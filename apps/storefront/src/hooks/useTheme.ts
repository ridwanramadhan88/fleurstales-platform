/**
 * @file useTheme.ts
 * @description Compatibility hook for the light-only Fleurstales build.
 * Dark mode has been removed. Existing consumers may keep using the same API,
 * but all setters resolve to light and the document root is always normalized.
 */

import { useCallback, useEffect } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'fleurstales:theme'

export const useTheme = () => {
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
    window.localStorage.removeItem(STORAGE_KEY)
  }, [])

  const setTheme = useCallback((_next: Theme) => {
    const root = window.document.documentElement
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
    window.localStorage.removeItem(STORAGE_KEY)
  }, [])

  const toggleTheme = useCallback(() => {
    const root = window.document.documentElement
    root.classList.remove('dark')
    root.style.colorScheme = 'light'
    window.localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { theme: 'light' as const, setTheme, toggleTheme }
}
