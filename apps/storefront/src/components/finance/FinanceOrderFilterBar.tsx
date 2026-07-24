/**
 * @file FinanceOrderFilterBar.tsx
 * @description Filter controls for the "Order list (finished)" section of
 * OrderTransactionVerificationQueue: the completion-date scope tabs, the
 * "Showing N of M" summary line, the status filter chip row (All / Pending
 * / Verified / Rejected / Review, with a count badge on Pending), and the
 * "Select" toggle that enters/exits bulk-verify mode. All filter state
 * itself is owned by the parent — this component is purely presentational
 * and wires user interactions back up via callbacks.
 */

import type { FC } from 'react'
import type { DateRange } from 'react-day-picker'
import { Search, X } from 'lucide-react'
import { ChipRow, FilterChip } from '../ui/chip'
import { FinanceDateScopeTabs, type FinanceDateScopeId } from './FinanceDateScopeTabs'

export type FinanceOrderStatusFilter = 'all' | 'pending' | 'verified' | 'rejected' | 'review'

export interface FinanceOrderStatusCounts {
  pending: number
  verified: number
  rejected: number
  review: number
}

export interface FinanceOrderFilterBarProps {
  dateScope: FinanceDateScopeId
  onDateScopeChange: (scope: FinanceDateScopeId) => void
  dateRange?: DateRange
  onDateRangeChange: (range: DateRange | undefined) => void

  /** Count of orders currently visible under the active date scope, before status filtering. */
  dateScopedCount: number
  /** Count of orders currently visible after status filtering (the "N" in "Showing N of M"). */
  filteredCount: number

  statusFilter: FinanceOrderStatusFilter
  onStatusFilterChange: (filter: FinanceOrderStatusFilter) => void
  statusCounts: FinanceOrderStatusCounts
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void

  /** Whether the current user can verify orders directly (Finance/Owner) — gates the "Select" toggle. */
  canVerify: boolean
  /** Whether there's at least one row eligible for bulk selection right now. */
  hasSelectableOrders: boolean
  isBulkSelectMode: boolean
  onToggleBulkSelectMode: () => void
}

/**
 * @description Human-readable label for the current date scope, used as the
 * heading of the summary line above the status chips.
 */
const dateScopeLabel = (scope: FinanceDateScopeId): string => {
  if (scope === 'this_week') return "This week's orders"
  if (scope === 'today') return "Today's orders"
  return 'Custom date orders'
}

const STATUS_OPTIONS: Array<{ id: FinanceOrderStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'To verify' },
  { id: 'verified', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'review', label: 'Needs attention' },
]

export const FinanceOrderFilterBar: FC<FinanceOrderFilterBarProps> = ({
  dateScope,
  onDateScopeChange,
  dateRange,
  onDateRangeChange,
  dateScopedCount,
  filteredCount,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  searchQuery = '',
  onSearchQueryChange,
  canVerify,
  hasSelectableOrders,
  isBulkSelectMode,
  onToggleBulkSelectMode,
}) => {
  return (
    <div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border/60 sm:p-5">
      {/* Date scope: This week / Today / Future / Custom, by completedAt.
          Same pill-segmented-control visual as Orders' OrdersSubTabs
          (FinanceDateScopeTabs is its own component), with a wider default
          ("This week") suited to Finance triaging a batch of
          recently-finished orders. */}
      <FinanceDateScopeTabs
        activeTab={dateScope}
        onTabChange={onDateScopeChange}
        dateRange={dateRange}
        onDateRangeChange={onDateRangeChange}
      />

      <p className="text-[11px] text-foreground">
        <span className="font-semibold">{dateScopeLabel(dateScope)}</span>
        <span className="text-muted-foreground">
          {' '}
          · Showing {filteredCount} of {dateScopedCount}
        </span>
      </p>

      {onSearchQueryChange && (
        <div className="relative hidden w-full lg:block lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search collect orders, customer, or ID..."
            className="h-9 w-full rounded-full border border-border bg-card pl-8 pr-8 text-sm text-foreground shadow-ios-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              aria-label="Clear finance search"
              className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Status filter chips: All / Pending / Verified / Rejected / Review,
          same FilterChip treatment as the Orders tab's All/New/Processing/etc
          row, with a count badge on Pending. */}
      <div className="relative flex min-w-0 flex-wrap items-center gap-2">
        <ChipRow activeKey={statusFilter} edge="none" className="flex-1">
          {STATUS_OPTIONS.map((option) => (
            <FilterChip
              key={option.id}
              active={statusFilter === option.id}
              tintedWhenActive
              onClick={() => onStatusFilterChange(option.id)}
              className="shrink-0"
            >
              {option.label}
              {option.id === 'pending' && statusCounts.pending > 0 && (
                <span
                  className={`ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-2xs font-semibold ${
                    statusFilter === 'pending'
                      ? 'bg-surface-selected text-primary-foreground'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {statusCounts.pending}
                </span>
              )}
            </FilterChip>
          ))}
        </ChipRow>

        {/* Toggles bulk-select mode on/off. Turning it off clears any
            in-progress selection (handled by the parent) so re-entering
            always starts fresh. */}
        {canVerify && hasSelectableOrders && (
          <button
            type="button"
            onClick={onToggleBulkSelectMode}
            className={`inline-flex shrink-0 cursor-pointer items-center rounded-full text-xs font-medium transition ${ isBulkSelectMode ? 'bg-surface-selected text-primary-foreground ring-1 ring-primary/30' : 'text-muted-foreground hover:bg-muted hover:text-foreground' } h-11 rounded-full px-[18px] gap-2 whitespace-nowrap`}
          >
            {isBulkSelectMode ? (
              <>
                <X className="size-3" />
                Cancel
              </>
            ) : (
              'Bulk verify'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default FinanceOrderFilterBar
