import { useUiLanguage, type UiLanguage } from '../../i18n/uiLanguage'
import { cn } from '../../lib/utils'

interface LanguageToggleProps {
  className?: string
}

const options: UiLanguage[] = ['id', 'en']

export const LanguageToggle = ({ className }: LanguageToggleProps) => {
  const language = useUiLanguage((state) => state.language)
  const setLanguage = useUiLanguage((state) => state.setLanguage)

  return (
    <div
      role="group"
      aria-label="Language"
      data-no-translate
      className={cn(
        'inline-flex h-8 items-center rounded-full bg-muted/60 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = language === option
        const label = option.toUpperCase()
        return (
          <button
            key={option}
            type="button"
            onClick={() => setLanguage(option)}
            aria-pressed={active}
            aria-label={`Use ${label}`}
            className={cn(
              'tap-scale inline-flex h-7 min-w-8 items-center justify-center rounded-full px-2 text-2xs font-semibold transition',
              active
                ? 'bg-foreground text-background shadow-none'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
