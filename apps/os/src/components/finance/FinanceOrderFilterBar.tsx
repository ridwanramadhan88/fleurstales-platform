import type { FC } from 'react'
import type { DateRange } from 'react-day-picker'
import { Search, X } from 'lucide-react'
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
  if (scope === 'all') return 'Semua pesanan selesai'
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
      <span className="text-muted-foreground"> · Menampilkan {filteredCount} dari {dateScopedCount}</span>
    </p>

    {onSearchQueryChange && (
      <div className="relative hidden w-full lg:block lg:max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Cari pesanan selesai, pelanggan, rekening..."
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
