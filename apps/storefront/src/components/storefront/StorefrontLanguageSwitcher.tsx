import type { FC } from 'react'
import { Languages } from 'lucide-react'
import { useUiLanguage } from '../../i18n/uiLanguage'

interface Props {
  floating?: boolean
}

/** Customer-facing language control. Indonesian is the product default. */
export const StorefrontLanguageSwitcher: FC<Props> = ({ floating = false }) => {
  const language = useUiLanguage((state) => state.language)
  const toggleLanguage = useUiLanguage((state) => state.toggleLanguage)
  const isIndonesian = language === 'id'
  const accessibleLabel = isIndonesian
    ? 'Bahasa Indonesia aktif. Ganti ke bahasa Inggris.'
    : 'English is active. Switch to Indonesian.'

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className={`${
        floating
          ? 'fixed bottom-5 right-5 z-[90] border-black/15 bg-[var(--sf-cream)] shadow-lg'
          : 'border-transparent bg-transparent hover:bg-black/[0.035]'
      } tap-scale inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold tracking-[0.08em] text-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/20`}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      data-no-translate
    >
      <Languages className="size-4" strokeWidth={1.9} aria-hidden="true" />
      <span>{isIndonesian ? 'ID' : 'EN'}</span>
    </button>
  )
}
