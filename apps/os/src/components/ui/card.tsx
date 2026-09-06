import { cn } from '@/lib/utils'

export type SurfaceCardDensity = 'dense' | 'standard' | 'summary'

const DENSITY_CLASS: Record<SurfaceCardDensity, string> = {
  dense: 'p-4',
  standard: 'p-5',
  summary: 'p-6',
}

/**
 * Shared card chrome. The density communicates purpose rather than changing
 * randomly by page: dense list rows, standard content groups, and large
 * summary/hero cards. Apple ladder: always rounded-2xl + hairline ring +
 * ios-sm depth so every card in the OS feels like one material.
 */
export const surfaceCardClass = (
  density: SurfaceCardDensity = 'standard',
  className?: string,
  // NOTE: pass `{ shadow: false }` for a flat card. Appending `shadow-none`
  // does NOT work: tailwind-merge doesn't recognize the custom
  // `shadow-ios-sm` token, so both classes survive, and the light-mode
  // `:root:not(.dark) .shadow-ios-sm` override (higher specificity) wins —
  // leaving a ghost shadow behind.
  options?: { shadow?: boolean },
) =>
  cn(
    'rounded-2xl bg-surface-card ring-1 ring-border/60',
    options?.shadow === false ? undefined : 'shadow-ios-sm',
    DENSITY_CLASS[density],
    className,
  )

export const cardHeaderClass = 'flex items-start justify-between gap-3'
export const cardBodyClass = 'mt-3'
export const cardActionsClass = 'mt-4'
export const dividedCardActionsClass = 'mt-4 border-t border-border/60 pt-4'
