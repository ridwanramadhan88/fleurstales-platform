import { useMemo } from 'react'
import { AlertTriangle, ArrowRight, CalendarClock, UserRound } from 'lucide-react'
import type { BranchFilter, OrderTableRow } from '../../types/orders'
import { useOrdersStore } from '../../store/ordersStore'
import { surfaceCardClass } from '../ui/card'
import { getOrderStatusGroup } from '../../domain/orderGroupingDomain'
import { getLocalDateString, nowInJakarta } from '../../domain/orderTimingDomain'
import { getOrderNextActionLabel } from '../orders/orderNextActionLabels'
import { getDisplayScheduleLabel } from '../orders/orderTableFormatters'

// "Work from the top" means the earliest due time first: date and time,
// not date alone (an 11:00 order must come before a 14:00 one).
const toDateValue = (order: OrderTableRow) => {
  if (!order.scheduleDate) return Number.POSITIVE_INFINITY
  const match = /^(\d{1,2}):(\d{2})/.exec(order.scheduleTime ?? '')
  const time = match ? `${match[1].padStart(2, '0')}:${match[2]}` : '23:59'
  const parsed = Date.parse(`${order.scheduleDate}T${time}:00`)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

// A badge only when it adds something: the schedule line below already says
// "Today · 14:00", so on-time orders need no "Due today" badge.
const getPriorityLabel = (order: OrderTableRow, today: string) => {
  if (!order.scheduleDate) return { label: 'No schedule', tone: 'bg-muted text-muted-foreground' }
  if (order.scheduleDate < today) return { label: 'Late', tone: 'bg-destructive/10 text-destructive' }
  return null
}

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

  const today = getLocalDateString(nowInJakarta())
  const activeOrders = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            ['active', 'delivery'].includes(getOrderStatusGroup(order)) &&
            (activeBranch === 'All' || order.branch === activeBranch),
        )
        .sort((a, b) => {
          const dateDiff = toDateValue(a) - toDateValue(b)
          if (dateDiff !== 0) return dateDiff
          const unassignedDiff = Number(Boolean(a.floristAssignedEmployeeId)) - Number(Boolean(b.floristAssignedEmployeeId))
          return unassignedDiff || a.orderNumber.localeCompare(b.orderNumber)
        }),
    [activeBranch, orders],
  )

  const visibleOrders = activeOrders.slice(0, 4)

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
          {visibleOrders.map((order, index) => {
            const priority = getPriorityLabel(order, today)
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
