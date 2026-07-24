/**
 * @file StockSummaryCards.tsx
 * @description Top-level summary cards for the Stock tab:
 * - Total available units.
 * - Low stock item count.
 * - Expired / near-expiry items.
 * - In-transit transfers.
 *
 * Each card is clickable and jumps straight to the matching status filter,
 * so the overview doubles as a shortcut into the filtered list instead of
 * being purely decorative. Uses the shared OverviewStatCard so this grid
 * matches Dashboard / Finance / HR / Revenue visually.
 * UI here only renders values derived by the stock domain layer.
 */

import type { FC } from 'react'
import type { StockItem, StockTransfer } from '../../store/stockStore'
import { getStockSummary } from '../../domain/stockDomain'
import { OverviewStatCard, OverviewStatGrid } from '../ui/overview-card'

/**
 * @description Props for the StockSummaryCards component.
 */
export interface StockSummaryCardsProps {
  /** Stock items currently in scope (usually for one branch). */
  items: StockItem[]
  /** All transfer records for the current branch scope. */
  transfers: StockTransfer[]
  /** Jumps the list below to the matching status filter when a card is clicked. */
  onSelectStatus?: (status: 'all' | 'low' | 'expired' | 'in_transit') => void
}

/**
 * @description Summary cards for the Stock operational dashboard.
 */
export const StockSummaryCards: FC<StockSummaryCardsProps> = ({
  items,
  transfers,
  onSelectStatus,
}) => {
  const summary = getStockSummary(items, transfers)

  return (
    <section aria-label="Stock overview summary">
      <header className="mb-2">
        <h2 className="text-xs font-semibold text-muted-foreground">
          Stock overview
        </h2>
        <p className="text-xs text-muted-foreground">
          Availability, freshness, and branch transfers.
        </p>
      </header>

      <OverviewStatGrid>
        <OverviewStatCard
          label="Total available"
          value={summary.totalAvailable.toString()}
          helper="Units available for orders"
          tone="success"
          onClick={onSelectStatus ? () => onSelectStatus('all') : undefined}
        />
        <OverviewStatCard
          label="Low stock items"
          value={summary.lowStockCount.toString()}
          helper="Review and restock soon"
          tone={summary.lowStockCount > 0 ? 'warning' : 'default'}
          onClick={onSelectStatus ? () => onSelectStatus('low') : undefined}
        />
        <OverviewStatCard
          label="Expiry risk"
          value={summary.expiredOrNearCount.toString()}
          helper="Expired / near expiry items"
          tone={summary.expiredOrNearCount > 0 ? 'danger' : 'default'}
          onClick={onSelectStatus ? () => onSelectStatus('expired') : undefined}
        />
        <OverviewStatCard
          label="In-transit stock"
          value={summary.activeTransferCount.toString()}
          helper="Branch transfers in motion"
          tone={summary.activeTransferCount > 0 ? 'warning' : 'default'}
          onClick={onSelectStatus ? () => onSelectStatus('in_transit') : undefined}
        />
      </OverviewStatGrid>
    </section>
  )
}

export default StockSummaryCards
