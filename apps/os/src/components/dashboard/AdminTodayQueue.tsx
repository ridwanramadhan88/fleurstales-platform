import { useMemo } from 'react'
import { AlertTriangle, ArrowRight, CalendarClock, UserRound } from 'lucide-react'
import type { BranchFilter } from '../../types/orders'
import { useOrdersStore } from '../../store/ordersStore'
import { surfaceCardClass } from '../ui/card'
import { prioritizeOrders } from '../../domain/orderWorkStageDomain'
import { nowInJakarta } from '../../domain/orderTimingDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { formatMinutesLeft, getOrderWorkStageLabel } from '../orders/orderWorkStagePresentation'
import { getOrderNextActionLabel } from '../orders/orderNextActionLabels'
import { getDisplayScheduleLabel } from '../orders/orderTableFormatters'

// "Work from the top": the same priority formula as the Orders list
// (time left before the order must be started or handed over, plus stage).
export function AdminTodayQueue({
  activeBranch,
  onGoToOrders,
  onOpenOrder,
}: {
  activeBranch: BranchFilter
  onGoToOrders: () => void
  onOpenOrder: (orderNumber: string) => void
}) {
  const orders = useOrdersStore((state) => state.orders)

  const copy = useBilingualCopy()
  const prioritized = useMemo(
    () => prioritizeOrders(
      orders.filter((order) => activeBranch === 'All' || order.branch === activeBranch),
      nowInJakarta(),
    ).filter((item) => item.priority.needsAdmin),
    [activeBranch, orders],
  )
  const activeOrders = prioritized.map((item) => item.order)

  const visibleItems = prioritized.slice(0, 4)
  const visibleOrders = visibleItems.map((item) => item.order)

  return (
    <section className={surfaceCardClass('standard', 'border border-border ring-0')} aria-label="Today's order priority">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold leading-6">Today&apos;s order priority</h2>
          <p className="text-sm text-muted-foreground">
            Work from the top. Open an order to perform its single next action.
          </p>
          {activeOrders.length > 0 && (
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {`Showing ${Math.min(visibleOrders.length, activeOrders.length)} of ${activeOrders.length} active order${activeOrders.length === 1 ? '' : 's'}.`}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onGoToOrders}
          className="inline-flex items-center rounded-full border border-border text-sm font-medium hover:bg-accent rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
        >
          View all orders
          <ArrowRight className="size-3.5" />
        </button>
      </header>

      {visibleOrders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-7 text-center">
          <p className="text-sm font-medium">No active orders need attention</p>
          <p className="mt-1 text-xs text-muted-foreground">New and active orders will appear here.</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {visibleItems.map(({ order, priority: rank }, index) => {
            const priority = rank.urgent && rank.minutesLeft !== null
              ? { label: formatMinutesLeft(rank.minutesLeft, copy), tone: 'bg-destructive text-white' }
              : rank.timeBucket === 'unscheduled'
                ? { label: copy('No schedule', 'Belum ada jadwal'), tone: 'bg-muted text-muted-foreground' }
                : null
            return (
              <article key={order.orderNumber} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {index === 0 && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        <AlertTriangle className="size-3.5" /> Do this first
                      </span>
                    )}
                    <span className="text-sm font-semibold leading-5">{order.orderNumber}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-foreground/80">{getOrderWorkStageLabel(rank.stage, order, copy)}</span>
                    {priority && (
                      <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${priority.tone}`}>
                        {priority.label}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm">{order.customerName} · {order.productName ?? order.items?.[0]?.productName ?? 'Custom order'}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    {getDisplayScheduleLabel(order) ?? 'Schedule not set'}
                  </p>
                </div>

                <div className="space-y-2">
                  {/* Plain text, so it does not look like a disabled button. */}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserRound className="size-3.5 shrink-0" />
                    <span className="truncate">{order.floristAssignedEmployeeId ? `Florist: ${order.florist ?? 'assigned'}` : 'Florist: not assigned yet'}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenOrder(order.orderNumber)}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    {getOrderNextActionLabel(order)}
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
