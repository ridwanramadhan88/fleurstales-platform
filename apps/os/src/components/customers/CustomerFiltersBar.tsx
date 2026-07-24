/**
 * @file CustomerFiltersBar.tsx
 * @description Filter bar for the Customers CRM tab:
 * - Search (name / WhatsApp / email), desktop only.
 * - Segment filter (New / Regular / VIP).
 * - Sort by recency, highest spend, most orders, or name.
 * On mobile/tablet, search instead lives in the main top bar (see TopBar /
 * CustomersTabContent).
 *
 * Semantics for filters and sort options are defined in customerDomain.ts.
 */

import type { FC } from 'react'
import type {
  CustomerSegmentFilter,
  CustomerSortOption,
} from '../../domain/customerDomain'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { ChipRow, FilterChip } from '../ui/chip'
import { FiltersSearchInput } from '../ui/filters-bar-shell'
import { surfaceCardClass } from '../ui/card'

/**
 * @description Props for the CustomerFiltersBar component.
 */
export interface CustomerFiltersBarProps {
  /** Currently active segment filter. */
  segmentFilter: CustomerSegmentFilter
  /** Handler fired when the segment filter changes. */
  onSegmentFilterChange: (value: CustomerSegmentFilter) => void
  /** Currently selected sort option. */
  sortOption: CustomerSortOption
  /** Handler fired when the sort option changes. */
  onSortOptionChange: (value: CustomerSortOption) => void
  /**
   * Search query, shown inline here on desktop only (`lg:` and up); on
   * smaller screens the same query is edited from the main top bar instead.
   */
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
}

/**
 * @description Filter bar for the CRM Customers tab.
 */
export const CustomerFiltersBar: FC<CustomerFiltersBarProps> = ({
  segmentFilter,
  onSegmentFilterChange,
  sortOption,
  onSortOptionChange,
  searchQuery,
  onSearchQueryChange,
}) => {
  const segmentOptions: { id: CustomerSegmentFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'new', label: 'New' },
    { id: 'regular', label: 'Regular' },
    { id: 'vip', label: 'VIP' },
  ]

  const sortOptions: { id: CustomerSortOption; label: string }[] = [
    { id: 'most_recent', label: 'Most recent activity' },
    { id: 'highest_spend', label: 'Highest spending' },
    { id: 'most_orders', label: 'Most orders' },
    { id: 'name_az', label: 'Name A–Z' },
  ]

  return (
    <section
      aria-label="Customer filters"
      className={surfaceCardClass('dense', 'space-y-3')}
    >
      {onSearchQueryChange && (
        <FiltersSearchInput
          value={searchQuery}
          onChange={onSearchQueryChange}
          placeholder="Search name, WhatsApp, or email"
        />
      )}

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <ChipRow activeKey={segmentFilter} edge="card">
          {segmentOptions.map((option) => {
            const isActive = segmentFilter === option.id
            return (
              <FilterChip
                key={option.id}
                onClick={() => onSegmentFilterChange(option.id)}
                active={isActive}
                className="shrink-0"
              >
                {option.label}
              </FilterChip>
            )
          })}
        </ChipRow>

        <Select
          value={sortOption}
          onValueChange={(value) =>
            onSortOptionChange(value as CustomerSortOption)
          }
        >
          <SelectTrigger className="h-9 w-full rounded-full border border-border bg-background px-3 py-1.5 text-sm shadow-ios-sm sm:min-w-[11rem] sm:w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {sortOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </section>
  )
}

export default CustomerFiltersBar

// Re-export domain types so other UI modules can import via this file.
export type {
  CustomerSegmentFilter,
  CustomerSortOption,
} from '../../domain/customerDomain'
