/**
 * @file overview-card.tsx
 * @description Single shared "overview stat card" used by every summary grid
 * in the app (Dashboard, Stock, Finance, HR, Revenue). Each of these used to
 * have its own near-duplicate implementation with slightly different
 * padding, container styles, and helper-text treatment; this is the one
 * source of truth so any visual tweak only needs to happen here.
 *
 * Cards are optionally clickable (pass `onClick`) — used to jump straight to
 * a filtered list/table from the overview, e.g. Stock's "Low stock items"
 * card opening the Low stock filter.
 */

import type { FC, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

export type OverviewCardTone = 'default' | 'success' | 'warning' | 'danger'

const TONE_TEXT: Record<OverviewCardTone, string> = {
  default: 'text-muted-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
}

export interface OverviewStatCardProps {
  /** Upper label, e.g. "Total orders" or "Low stock items". */
  label: string
  /** Main value (number, currency, etc). */
  value: ReactNode
  /** Supporting caption below the value. */
  helper?: ReactNode
  /** Tone applied to the helper text (and the chevron affordance). */
  tone?: OverviewCardTone
  /** Optional classes to resize the value text (e.g. long currency strings). */
  valueClassName?: string
  /** Optional classes for the supporting caption. */
  helperClassName?: string
  /** Makes the card clickable — e.g. to jump to a filtered list. */
  onClick?: () => void
  className?: string
}

/**
 * @description The one overview stat-card look used everywhere. Optionally
 * clickable — shows a chevron affordance and responds to Enter/Space when it is.
 */
export const OverviewStatCard: FC<OverviewStatCardProps> = ({
  label,
  value,
  helper,
  tone = 'default',
  valueClassName,
  helperClassName,
  onClick,
  className,
}) => {
  return (
    <article
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'flex min-h-20 h-full flex-col justify-between rounded-xl bg-surface-card p-3.5 text-left ring-1 ring-border/60 transition',
        onClick && 'tap-scale cursor-pointer hover:bg-accent/60',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-2xs font-semibold text-muted-foreground">
          {label}
        </p>
        {onClick && (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/40" />
        )}
      </div>
      <div className="mt-1.5 space-y-0.5">
        <p
          className={
            valueClassName ??
            'font-display text-2xl font-semibold leading-none text-foreground'
          }
        >
          {value}
        </p>
        {helper && (
          <p className={cn('text-xs font-medium leading-snug', TONE_TEXT[tone], helperClassName)}>
            {helper}
          </p>
        )}
      </div>
    </article>
  )
}

/**
 * @description Standard 2-up/4-up responsive grid wrapper for a row of
 * OverviewStatCards, shared so every tab's overview breaks the same way.
 */
export const OverviewStatGrid: FC<{ children: ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      'grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3',
      className,
    )}
  >
    {children}
  </div>
)

export default OverviewStatCard
