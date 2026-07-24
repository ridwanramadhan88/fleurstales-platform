/**
 * @file StockFiltersBar.tsx
 * @description Operational filters for the Stock tab:
 * - Search (desktop only; mobile/tablet search lives in the main top bar).
 * - Status (All, Low stock, Expired, In transit, Archived) — a dropdown,
 *   since these are operational states rather than a primary browsing axis.
 * - Type (All, Fresh flower, Artificial flower, Supplies) — chips, the
 *   primary way people scan inventory day to day.
 *
 * Filtering semantics (status/type values) are defined in the stock domain
 * layer; this component only renders controls.
 */

import type { FC } from 'react'
import { ArrowDownUp } from 'lucide-react'
import type { StockStatusFilter, StockTypeFilter } from '../../domain/stockDomain'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { ChipRow, FilterChip } from '../ui/chip'
import { FiltersBarShell, FiltersSearchInput } from '../ui/filters-bar-shell'

const STATUS_OPTIONS: { id: StockStatusFilter; label: string }[] = [
  { id: 'all', label: 'All items' },
  { id: 'low', label: 'Low stock' },
  { id: 'expired', label: 'Expired' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'archived', label: 'Archived' },
]

const TYPE_OPTIONS: { id: StockTypeFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'fresh_flower', label: 'Fresh flower' },
  { id: 'artificial_flower', label: 'Artificial' },
  { id: 'Supplies', label: 'Supplies' },
]

/**
 * @description Props for the StockFiltersBar component.
 */
export interface StockFiltersBarProps {
  /** Currently active status filter. */
  statusFilter: StockStatusFilter
  /** Handler for changing status filter. */
  onStatusFilterChange: (value: StockStatusFilter) => void
  /** Currently active type filter (fresh / artificial / supplies). */
  typeFilter: StockTypeFilter
  /** Handler for changing type filter. */
  onTypeFilterChange: (value: StockTypeFilter) => void
  /** Label for the branch scope (for display only). */
  branchLabel: string
  /**
   * Search query, shown inline here on desktop only (`lg:` and up); on
   * smaller screens the same query is edited from the main top bar instead.
   */
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
}

/**
 * @description Filter bar for Stock items: status dropdown + type chips.
 * Mirrors the CatalogFiltersBar layout template for visual consistency.
 */
export const StockFiltersBar: FC<StockFiltersBarProps> = ({
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
  branchLabel,
  searchQuery,
  onSearchQueryChange,
}) => {
  return (
    <FiltersBarShell
      ariaLabel="Stock filters"
      subtitle={branchLabel}
      middle={
        onSearchQueryChange && (
          <FiltersSearchInput
            value={searchQuery}
            onChange={onSearchQueryChange}
            placeholder="Search inventory items..."
          />
        )
      }
      controls={
        <Select
          value={statusFilter}
          onValueChange={(value) => onStatusFilterChange(value as StockStatusFilter)}
        >
          <SelectTrigger
            className="h-9 w-auto gap-1.5 rounded-full border border-border bg-background px-3 py-0 text-xs font-medium shadow-ios-sm"
            aria-label="Filter by status"
          >
            <ArrowDownUp className="size-3.5 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {/* Type chips */}
      <ChipRow activeKey={typeFilter} edge="none">
        {TYPE_OPTIONS.map((option) => (
          <FilterChip
            key={option.id}
            onClick={() => onTypeFilterChange(option.id)}
            active={typeFilter === option.id}
            className="shrink-0"
          >
            {option.label}
          </FilterChip>
        ))}
      </ChipRow>
    </FiltersBarShell>
  )
}

export default StockFiltersBar

// Re-export domain filter types so other UI modules can depend on them via this file.
export type { StockStatusFilter, StockTypeFilter } from '../../domain/stockDomain'
