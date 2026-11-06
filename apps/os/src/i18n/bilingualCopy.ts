import { useUiLanguage } from './uiLanguage'

/**
 * Explicit EN/ID copy for new screens. The DOM translation layer works word by
 * word and can produce mixed sentences for new copy; writing both languages
 * out avoids that.
 */
export const useBilingualCopy = (): ((en: string, id: string) => string) => {
  const language = useUiLanguage((state) => state.language)
  return (en, id) => (language === 'id' ? id : en)
}
