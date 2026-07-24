import { useMemo } from 'react'
import type { BranchFilter } from '../../types/orders'
import { useOrdersStore } from '../../store/ordersStore'
import { nowInJakarta } from '../../domain/orderTimingDomain'
import { formatIdrCurrency } from '../../lib/formatters'
import { OverviewStatCard, OverviewStatGrid } from '../ui/overview-card'
import { getOrderStatusGroup } from '../../domain/orderGroupingDomain'

const dateInJakarta = (iso?: string): string | null => {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

export function AdminFinishedMetrics({
  activeBranch,
  onOpenFinishedOrders,
}: {
  activeBranch: BranchFilter
  onOpenFinishedOrders: () => void
}) {
  const orders = useOrdersStore((state) => state.orders)
  const today = useMemo(() => {
    const now = nowInJakarta()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])
  const finished = useMemo(() => orders.filter((order) =>
    getOrderStatusGroup(order) === 'completed' &&
    (activeBranch === 'All' || order.branch === activeBranch) &&
    dateInJakarta(order.completedAt) === today,
  ), [activeBranch, orders, today])
  const total = finished.reduce((sum, order) => sum + order.totalIdr, 0)

  return (
    <section aria-label="Today's finished orders" className="space-y-2.5">
      <div>
        <h2 className="text-base font-semibold">Today&apos;s finished orders</h2>
        <p className="text-xs text-muted-foreground">Completed orders for the selected branch. Open either metric to review the Finished list.</p>
      </div>
      <OverviewStatGrid className="sm:grid-cols-2">
        <OverviewStatCard
          label="Finished order quantity"
          value={String(finished.length)}
          helper="Open Finished orders"
          tone="default"
          onClick={onOpenFinishedOrders}
        />
        <OverviewStatCard
          label="Finished order total"
          value={formatIdrCurrency(total)}
          helper="Open Finished orders"
          tone="default"
          valueClassName="font-display text-xl font-semibold leading-none text-foreground"
          onClick={onOpenFinishedOrders}
        />
      </OverviewStatGrid>
    </section>
  )
}
