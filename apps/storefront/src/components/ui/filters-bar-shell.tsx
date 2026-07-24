/**
 * @file filters-bar-shell.tsx
 * @description Shared pieces for the per-domain filter bars (Catalog, Stock,
 * Customers): the outer card shell + header row layout, and the
 * desktop-only search input with a clear button. These three components
 * used to each hand-roll an identical version of both; this file is the
 * single source of truth for that shared chrome, while each domain's
 * FiltersBar keeps its own filter controls (chips vs dropdowns, which
 * fields exist) since those genuinely differ per tab.
 */

import type { FC, ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { surfaceCardClass } from './card'
import { cn } from '../../lib/utils'

export interface FiltersBarShellProps {
  /** Accessible label for the outer <section>, e.g. "Catalog filters". */
  ariaLabel: string
  /** Label shown top-left, e.g. "Filters". Defaults to "Filters". */
  label?: string
  /** Optional subtitle under the label, e.g. a branch name. */
  subtitle?: string
  /** Content placed after the label/subtitle, before the right-side controls
   * (typically the desktop search input via <FiltersSearchInput />). */
  middle?: ReactNode
  /** Right-aligned controls, e.g. a sort Select or status dropdown. */
  controls?: ReactNode
  /** Content below the header row, e.g. chip rows or a sub-category select. */
  children?: ReactNode
  /** Optional domain-specific surface adjustments. */
  className?: string
}

/**
 * @description Outer card + header row shared by all FiltersBar variants.
 */
export const FiltersBarShell: FC<FiltersBarShellProps> = ({
  ariaLabel,
  label = 'Filters',
  subtitle,
  middle,
  controls,
  children,
  className,
}) => {
  return (
    <section
      aria-label={ariaLabel}
      className={surfaceCardClass('dense', cn('min-w-0 space-y-3', className))}
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <p className="text-xs font-semibold text-muted-foreground">
            {label}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground/80">{subtitle}</p>
          )}
        </div>

        {middle}

        {controls && <div className="ml-auto flex shrink-0 items-center gap-2">{controls}</div>}
      </div>

      {children}
    </section>
  )
}

export interface FiltersSearchInputProps {
  value?: string
  onChange: (value: string) => void
  placeholder: string
  /**
   * 'lg' (default) matches Catalog/Stock's search field (h-11, larger icon).
   * 'sm' matches Customer's smaller variant (h-9). Kept as a prop rather
   * than a single fixed size so extracting this component doesn't change
   * either tab's existing appearance.
   */
  size?: 'sm' | 'lg'
}

/**
 * @description Desktop-only (`lg:` and up) search field with a clear button.
 * On smaller screens the equivalent search field lives in the main top bar
 * instead — this component intentionally renders nothing below `lg`.
 */
export const FiltersSearchInput: FC<FiltersSearchInputProps> = ({
  value,
  onChange,
  placeholder,
  size = 'lg',
}) => {
  const isSmall = size === 'sm'

  return (
    <div className={isSmall ? 'relative hidden lg:block' : 'relative hidden min-w-0 flex-1 lg:block'}>
      <Search
        className={
          isSmall
            ? 'pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground'
            : 'pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground'
        }
      />
      <input
        type="search"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={
          isSmall
            ? 'h-9 w-full rounded-full border border-border bg-background pl-8 pr-8 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'
            : 'h-11 w-full rounded-full border border-border bg-background pl-10 pr-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40'
        }
      />
      {value && value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className={
            isSmall
              ? 'absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground'
              : 'absolute right-3 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground'
          }
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
