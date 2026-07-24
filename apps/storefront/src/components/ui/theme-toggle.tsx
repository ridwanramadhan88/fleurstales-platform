/**
 * @file theme-toggle.tsx
 * @description Small icon button that flips between light and dark theme.
 * Purely presentational — the actual theme state lives in useTheme().
 */

import type { FC } from 'react'
import { Moon, Sun } from 'lucide-react'
import type { Theme } from '../../hooks/useTheme'

export interface ThemeToggleProps {
  theme: Theme
  onToggle: () => void
  /** Optional extra classes, e.g. to match a surrounding control's sizing. */
  className?: string
}

export const ThemeToggle: FC<ThemeToggleProps> = ({
  theme,
  onToggle,
  className = '',
}) => {
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      className={`tap-scale flex shrink-0 items-center justify-center rounded-full bg-transparent text-foreground transition hover:bg-muted/70 ${className} size-11 p-0`}
    >
      {isDark ? (
        <Sun className="size-4" strokeWidth={2} />
      ) : (
        <Moon className="size-4" strokeWidth={2} />
      )}
    </button>
  )
}
