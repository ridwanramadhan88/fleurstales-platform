import { cn } from '@/lib/utils'

export type SurfaceCardDensity = 'dense' | 'standard' | 'summary'

const DENSITY_CLASS: Record<SurfaceCardDensity, string> = {
  dense: 'p-3',
  standard: 'p-3.5',
  summary: 'p-4',
}

/**
 * Shared card chrome. The density communicates purpose rather than changing
 * randomly by page: dense list rows, standard content groups, and large
 * summary/hero cards.
 */
export const surfaceCardClass = (
  density: SurfaceCardDensity = 'standard',
  className?: string,
) =>
  cn(
    'rounded-xl bg-surface-card ring-1 ring-border/60',
    DENSITY_CLASS[density],
    density === 'summary' ? 'shadow-ios-sm' : 'shadow-none',
    className,
  )

export const cardHeaderClass = 'flex items-start justify-between gap-3'
export const cardBodyClass = 'mt-2.5'
export const cardActionsClass = 'mt-3'
export const dividedCardActionsClass = 'mt-3 border-t border-border/60 pt-3'
