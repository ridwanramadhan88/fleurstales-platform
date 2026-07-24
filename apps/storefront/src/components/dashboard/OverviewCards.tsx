/**
 * @file OverviewCards.tsx
 * @description Dashboard overview statistic cards for orders, revenue, at-risk orders, and low stock alerts.
 * Uses the shared OverviewStatCard/OverviewStatGrid so this matches the
 * Stock / Finance / HR / Revenue overview grids everywhere else in the app.
 *
 * Data flow: ordersStore / stockStore (data) → revenueDomain / alertsDomain /
 * stockDomain (logic) → this component (render only). No metric here owns
 * its own state; everything is derived live from shared stores so it stays
 * in sync with Orders, Stock, and Catalog.
 */

import type { FC } from 'react'
import { OverviewStatCard, OverviewStatGrid } from '../ui/overview-card'
import type { OverviewCardsViewModel } from './OverviewCardsController'

/**
 * @description Grid of four key KPIs displayed at the top of the dashboard.
 * All values are derived live from Orders and Stock — nothing here is
 * hardcoded or locally owned.
 */
export const OverviewCards: FC<OverviewCardsViewModel> = ({
  ordersToday,
  ordersHelper,
  ordersTone,
  revenueToday,
  revenueHelper,
  revenueTone,
  atRiskCount,
  atRiskHelper,
  atRiskTone,
  lowStockCount,
  lowStockHelper,
  lowStockTone,
  inventoryEnabled,
}) => {
  return (
    <section aria-label="Today dashboard overview" className="space-y-2">
      <h2 className="text-sm font-semibold leading-5 text-foreground">Today at a glance</h2>
      <OverviewStatGrid>
        <OverviewStatCard
          label="Orders today"
          value={ordersToday}
          helper={ordersHelper}
          tone={ordersTone}
        />
        <OverviewStatCard
          label="Revenue today"
          value={revenueToday}
          valueClassName="text-xl font-semibold leading-tight text-foreground sm:text-2xl"
          helper={revenueHelper}
          tone={revenueTone}
        />
        <OverviewStatCard
          label="At-risk / late"
          value={atRiskCount}
          helper={atRiskHelper}
          tone={atRiskTone}
        />
{inventoryEnabled && (
          <OverviewStatCard
            label="Low stock alerts"
            value={lowStockCount}
            helper={lowStockHelper}
            tone={lowStockTone}
          />
        )}
      </OverviewStatGrid>
    </section>
  )
}

export default OverviewCards
