import * as React from 'react'
import { cn } from '@/lib/utils'
import { useActiveItemScroll } from '@/hooks/useActiveItemScroll'

/**
 * @file chip.tsx
 * @description The two pill variants defined in the UI cleanup brief
 * (Section 5), so components stop inventing new one-off chip/badge styles:
 *
 * - FilterChip: for scope tabs and status-group filters (Active/Completed,
 *   status groups). Outlined pill, `bg-card` when inactive, solid/tinted
 *   when active.
 * - StatusChip: tinted pill + colored dot, matching the treatment already
 *   used correctly in the Orders table. Reuse this anywhere a status is
 *   shown (Priority Actions, System Alerts, dashboard cards) instead of
 *   rectangular cards, solid icon circles, or plain unstyled text.
 */

export type ChipTone = 'primary' | 'destructive' | 'warning' | 'info' | 'success' | 'neutral'

const TONE_TINT: Record<ChipTone, string> = {
  primary: 'bg-primary/10 text-primary',
  destructive: 'bg-surface-error text-destructive ring-1 ring-destructive/25',
  warning: 'bg-surface-warning text-warning ring-1 ring-warning/25',
  info: 'bg-surface-info text-info ring-1 ring-info/25',
  success: 'bg-surface-success text-success ring-1 ring-success/25',
  neutral: 'bg-surface-neutral text-foreground ring-1 ring-border/80',
}

const TONE_DOT: Record<ChipTone, string> = {
  primary: 'bg-primary',
  destructive: 'bg-destructive',
  warning: 'bg-warning',
  info: 'bg-info',
  success: 'bg-success',
  neutral: 'bg-muted-foreground/50',
}

export interface FilterChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  /** Use the tinted-primary active look instead of solid foreground/white. */
  tintedWhenActive?: boolean
}

/**
 * @description Filter chip for scope tabs / status-group filters. Exactly
 * one visual style, reused everywhere instead of ad hoc pill padding.
 */
export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ active, tintedWhenActive, className, children, ...props }, ref) => {
    const activeClasses = tintedWhenActive
      ? 'border-primary bg-surface-selected text-primary-foreground shadow-ios-sm ring-1 ring-primary/30'
      : 'border-primary bg-primary text-primary-foreground shadow-ios-sm'

    return (
      <button
        ref={ref}
        type="button"
        data-active={active ? 'true' : undefined}
        className={cn(
          'tap-scale inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition',
          active
            ? activeClasses
            : 'border-border bg-surface-card text-muted-foreground hover:bg-accent hover:text-foreground',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)
FilterChip.displayName = 'FilterChip'

export interface StatusChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: ChipTone
  /** Show the small colored dot before the label (default: true). */
  showDot?: boolean
}

/**
 * @description Status badge: tinted pill + colored dot. This is the
 * treatment already used correctly in the Orders table status column —
 * reuse it everywhere else a status is displayed.
 */
export const StatusChip = React.forwardRef<HTMLSpanElement, StatusChipProps>(
  ({ tone, showDot = true, className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium leading-4',
          TONE_TINT[tone],
          className,
        )}
        {...props}
      >
        {showDot && (
          <span className={cn('size-1.5 rounded-full', TONE_DOT[tone])} />
        )}
        {children}
      </span>
    )
  },
)
StatusChip.displayName = 'StatusChip'


export interface ChipRowProps extends React.HTMLAttributes<HTMLDivElement> {
  activeKey?: unknown
  edge?: 'page' | 'card' | 'none'
}

const CHIP_ROW_EDGE: Record<NonNullable<ChipRowProps['edge']>, string> = {
  page: '-mx-4 px-4 scroll-px-4',
  card: '-mx-3 px-3 scroll-px-3',
  none: 'scroll-px-4',
}

/**
 * Horizontally scrollable filter-chip row with one spacing rhythm and safe
 * leading/trailing edges. The active chip is kept fully in view.
 */
export const ChipRow = React.forwardRef<HTMLDivElement, ChipRowProps>(
  ({ activeKey, edge = 'page', className, children, ...props }, forwardedRef) => {
    const activeRef = useActiveItemScroll<HTMLDivElement>(activeKey)

    const setRef = (node: HTMLDivElement | null) => {
      activeRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    }

    return (
      <div
        ref={setRef}
        className={cn(
          'no-scrollbar flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-1 overscroll-x-contain',
          CHIP_ROW_EDGE[edge],
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)
ChipRow.displayName = 'ChipRow'
