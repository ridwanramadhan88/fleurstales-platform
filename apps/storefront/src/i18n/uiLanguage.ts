import { create } from 'zustand'

export type UiLanguage = 'id' | 'en'

// v2 intentionally resets the old hidden preference. This release exposes a
// customer-facing selector and establishes Indonesian as the true first-run
// default; explicit choices made with the new selector continue to persist.
const STORAGE_KEY = 'fleurstales-ui-language-v2'

const readStoredLanguage = (): UiLanguage => {
  if (typeof window === 'undefined') return 'id'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'en' ? 'en' : 'id'
}

interface UiLanguageState {
  language: UiLanguage
  setLanguage: (language: UiLanguage) => void
  toggleLanguage: () => void
}

export const useUiLanguage = create<UiLanguageState>((set, get) => ({
  language: readStoredLanguage(),
  setLanguage: (language) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, language)
    set({ language })
  },
  toggleLanguage: () => {
    const next = get().language === 'id' ? 'en' : 'id'
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next)
    set({ language: next })
  },
}))

export const getUiLanguage = (): UiLanguage => useUiLanguage.getState().language
