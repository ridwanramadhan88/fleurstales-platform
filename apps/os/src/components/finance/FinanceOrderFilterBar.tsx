import type { FC } from 'react'
import type { DateRange } from 'react-day-picker'
import { CalendarDays, Search, X } from 'lucide-react'
import { FinanceDateScopeTabs, type FinanceDateScopeId } from './FinanceDateScopeTabs'

export type FinanceOrderStatusFilter = 'all' | 'awaiting_review' | 'needs_correction' | 'reconciled'

export interface FinanceOrderStatusCounts {
  awaitingReview: number
  needsCorrection: number
  reconciled: number
}

export interface FinanceOrderMonthOption {
  value: string
  label: string
  count: number
}

export interface FinanceOrderFilterBarProps {
  dateScope: FinanceDateScopeId
  onDateScopeChange: (scope: FinanceDateScopeId) => void
  dateRange?: DateRange
  onDateRangeChange: (range: DateRange | undefined) => void
  monthFilter: string
  monthOptions: FinanceOrderMonthOption[]
  onMonthFilterChange: (month: string) => void
  dateScopedCount: number
  filteredCount: number
  statusFilter: FinanceOrderStatusFilter
  onStatusFilterChange: (filter: FinanceOrderStatusFilter) => void
  statusCounts: FinanceOrderStatusCounts
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
}

const dateScopeLabel = (scope: FinanceDateScopeId): string => {
  if (scope === 'all') return 'All payment dates'
  if (scope === 'this_week') return 'Payments this week'
  if (scope === 'today') return 'Payments today'
  return 'Custom payment dates'
}

export const FinanceOrderFilterBar: FC<FinanceOrderFilterBarProps> = ({
  dateScope,
  onDateScopeChange,
  dateRange,
  onDateRangeChange,
  monthFilter,
  monthOptions,
  onMonthFilterChange,
  dateScopedCount,
  filteredCount,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  searchQuery = '',
  onSearchQueryChange,
}) => (
  <div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border/60 sm:p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 flex-1">
        <FinanceDateScopeTabs
          activeTab={dateScope}
          onTabChange={onDateScopeChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
        />
      </div>

      <label className="block min-w-48 space-y-1.5 text-xs font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" /> Accounting month</span>
        <select
          value={monthFilter}
          onChange={(event) => onMonthFilterChange(event.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All months</option>
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label} · {option.count}</option>
          ))}
        </select>
      </label>
    </div>

    <div className="no-scrollbar flex gap-1 overflow-x-auto" aria-label="Reconciliation status filters">
      {([
        ['all', 'All', dateScopedCount],
        ['awaiting_review', 'Awaiting review', statusCounts.awaitingReview],
        ['needs_correction', 'Needs correction', statusCounts.needsCorrection],
        ['reconciled', 'Reconciled', statusCounts.reconciled],
      ] as const).map(([value, label, count]) => (
        <button
          key={value}
          type="button"
          onClick={() => onStatusFilterChange(value)}
          aria-pressed={statusFilter === value}
          className={`h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${
            statusFilter === value
              ? 'bg-primary text-primary-foreground'
              : value === 'needs_correction' && count > 0
                ? 'bg-warning/10 text-warning ring-1 ring-warning/20'
                : value === 'awaiting_review' && count > 0
                  ? 'bg-info/10 text-info ring-1 ring-info/20'
                  : 'bg-muted/55 text-muted-foreground hover:text-foreground'
          }`}
        >
          {label} · {count}
        </button>
      ))}
    </div>

    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <p className="text-[11px] text-foreground">
        <span className="font-semibold">{dateScopeLabel(dateScope)}</span>
        <span className="text-muted-foreground"> · Showing {filteredCount} of {dateScopedCount}</span>
      </p>

      {onSearchQueryChange && (
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search order, customer, account, transaction code..."
            className="h-9 w-full rounded-full border border-border bg-card pl-8 pr-8 text-sm text-foreground shadow-ios-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => onSearchQueryChange('')}
              aria-label="Clear reconciliation search"
              className="absolute right-2.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  </div>
)

export default FinanceOrderFilterBar
