import { useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, PackageCheck } from 'lucide-react'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import { surfaceCardClass } from '../ui/card'

const ACTIVE_STATUSES = new Set(['processing', 'ready'])

const statusLabel = (status: string) => status === 'ready' ? 'Ready' : 'Processing'

export function FloristAssignedOrders({ onGoToOrders: _onGoToOrders }: { onGoToOrders: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const employeeId = useUserStore((state) => state.employeeId)
  const orders = useOrdersStore((state) => state.orders)

  const assignedOrders = useMemo(
    () => orders
      .filter((order) => order.floristAssignedEmployeeId === employeeId && ACTIVE_STATUSES.has(order.status))
      .sort((a, b) => `${a.scheduleDate ?? '9999-12-31'}T${a.scheduleTime ?? '23:59'}`.localeCompare(`${b.scheduleDate ?? '9999-12-31'}T${b.scheduleTime ?? '23:59'}`)),
    [employeeId, orders],
  )

  const visibleOrders = expanded ? assignedOrders : assignedOrders.slice(0, 4)

  return (
    <section className={surfaceCardClass('standard', 'border border-border ring-0')} aria-label="My assigned orders">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6">My assigned orders</h2>
          <p className="text-sm text-muted-foreground">Continue the most urgent assigned order first.</p>
        </div>
        <button type="button" onClick={() => setExpanded((value) => !value)} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-border px-[18px] text-sm font-medium hover:bg-accent">
          {expanded ? 'Show less' : `View all${assignedOrders.length > 4 ? ` (${assignedOrders.length})` : ''}`} <ArrowRight className={`size-3.5 transition ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </header>

      {visibleOrders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-7 text-center">
          <PackageCheck className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No assigned orders right now</p>
          <p className="mt-1 text-xs text-muted-foreground">New assigned orders will appear here.</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {visibleOrders.map((order) => (
            <div key={order.orderNumber} className="flex w-full items-center justify-between gap-3 p-3 text-left">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold leading-5">{order.orderNumber}</span>
                  <span className="rounded-full bg-surface-neutral px-2 py-0.5 text-2xs font-semibold text-foreground ring-1 ring-border/80">{statusLabel(order.status)}</span>
                </div>
                <p className="mt-1 truncate text-sm">{order.customerName} · {order.productName ?? order.items?.[0]?.productName ?? 'Custom order'}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><CalendarClock className="size-3.5" />{order.scheduleLabel ?? order.scheduleDate ?? 'Schedule not set'}</p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
