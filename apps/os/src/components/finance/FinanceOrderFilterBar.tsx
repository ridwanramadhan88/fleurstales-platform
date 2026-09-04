import type { FC } from 'react'
import type { DateRange } from 'react-day-picker'
import { Search, X } from 'lucide-react'
import { ChipRow, FilterChip } from '../ui/chip'
import { FinanceDateScopeTabs, type FinanceDateScopeId } from './FinanceDateScopeTabs'

export type FinanceOrderStatusFilter = 'all' | 'in_progress' | 'complete'

export interface FinanceOrderStatusCounts {
  inProgress: number
  complete: number
}

export interface FinanceOrderFilterBarProps {
  dateScope: FinanceDateScopeId
  onDateScopeChange: (scope: FinanceDateScopeId) => void
  dateRange?: DateRange
  onDateRangeChange: (range: DateRange | undefined) => void
  dateScopedCount: number
  filteredCount: number
  statusFilter: FinanceOrderStatusFilter
  onStatusFilterChange: (filter: FinanceOrderStatusFilter) => void
  statusCounts: FinanceOrderStatusCounts
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
}

const dateScopeLabel = (scope: FinanceDateScopeId): string => {
  if (scope === 'all') return 'All paid orders'
  if (scope === 'this_week') return "This week's payments"
  if (scope === 'today') return "Today's payments"
  return 'Custom payment dates'
}

const STATUS_OPTIONS: Array<{ id: FinanceOrderStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'complete', label: 'Complete' },
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
}) => (
  <div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-border/60 sm:p-5">
    <FinanceDateScopeTabs
      activeTab={dateScope}
      onTabChange={onDateScopeChange}
      dateRange={dateRange}
      onDateRangeChange={onDateRangeChange}
    />

    <p className="text-[11px] text-foreground">
      <span className="font-semibold">{dateScopeLabel(dateScope)}</span>
      <span className="text-muted-foreground"> · Showing {filteredCount} of {dateScopedCount}</span>
    </p>

    {onSearchQueryChange && (
      <div className="relative hidden w-full lg:block lg:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search paid orders, customer, account..."
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

    <ChipRow activeKey={statusFilter} edge="none">
      {STATUS_OPTIONS.map((option) => {
        const count = option.id === 'in_progress'
          ? statusCounts.inProgress
          : option.id === 'complete'
            ? statusCounts.complete
            : null
        return (
          <FilterChip
            key={option.id}
            active={statusFilter === option.id}
            tintedWhenActive
            onClick={() => onStatusFilterChange(option.id)}
            className="shrink-0"
          >
            {option.label}
            {count !== null && count > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary/10 px-1 text-2xs font-semibold text-primary">
                {count}
              </span>
            )}
          </FilterChip>
        )
      })}
    </ChipRow>
  </div>
)

export default FinanceOrderFilterBar
