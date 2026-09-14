import type { FC } from 'react'
import type { DateRange } from 'react-day-picker'
import { Search, X } from 'lucide-react'
import { FinanceDateScopeTabs, type FinanceDateScopeId } from './FinanceDateScopeTabs'

export type FinanceOrderStatusFilter = 'all' | 'needs_correction' | 'in_progress' | 'complete'

export interface FinanceOrderStatusCounts {
  needsCorrection: number
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
  if (scope === 'all') return 'Semua pembayaran'
  if (scope === 'this_week') return 'Pembayaran minggu ini'
  if (scope === 'today') return 'Pembayaran hari ini'
  return 'Tanggal pembayaran khusus'
}

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

    <div className="no-scrollbar flex gap-1 overflow-x-auto" aria-label="Reconciliation status filters">
      {([
        ['all', 'All', dateScopedCount],
        ['needs_correction', 'Needs correction', statusCounts.needsCorrection],
        ['in_progress', 'In progress', statusCounts.inProgress],
        ['complete', 'Complete', statusCounts.complete],
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
                : 'bg-muted/55 text-muted-foreground hover:text-foreground'
          }`}
        >
          {label} · {count}
        </button>
      ))}
    </div>

    <p className="text-[11px] text-foreground">
      <span className="font-semibold">{dateScopeLabel(dateScope)}</span>
      <span className="text-muted-foreground"> · Menampilkan {filteredCount} dari {dateScopedCount}</span>
    </p>

    {onSearchQueryChange && (
      <div className="relative hidden w-full lg:block lg:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Cari pesanan, pelanggan, rekening..."
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
)

export default FinanceOrderFilterBar
