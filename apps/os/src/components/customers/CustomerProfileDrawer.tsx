/**
 * @file CustomerProfileDrawer.tsx
 * @description Detailed CRM drawer for a single customer profile.
 * All behavioural meaning (segment, activity, value) is derived in
 * customerDomain. This component only displays domain outputs and
 * raw order history.
 */

import type { FC } from 'react'
import {
  Ticket,
  Wallet,
  ShoppingBag,
  TrendingUp,
  MapPin,
  MessageCircle,
} from 'lucide-react'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import type { CustomerMetrics } from '../../domain/customerDomain'
import { getCustomerValueScore } from '../../domain/customerDomain'
import type { OrderTableRow, OrderStatus } from '../../types/orders'
import { StatusChip, type ChipTone } from '../ui/chip'
import { AppSheet } from '../ui/app-sheet'

/**
 * @description Props for the CustomerProfileDrawer component.
 */
export interface CustomerProfileDrawerProps {
  /** Raw customer profile. */
  customer: CustomerProfile
  /** Domain metrics for this customer. */
  metrics: CustomerMetrics
  /** Orders linked to this customer (pre-joined in parent). */
  orders: OrderTableRow[]
  /** Called when drawer should close. */
  onClose: () => void
  /** Called when staff wants to assign a promo to this customer. */
  onAssignPromo: () => void
}

/** Tone + label per order status, for the order history list. */
const ORDER_STATUS_META: Record<OrderStatus, { label: string; tone: ChipTone }> = {
  pending_verification: { label: 'Pending', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  processing: { label: 'Processing', tone: 'primary' },
  ready: { label: 'Ready', tone: 'success' },
  delivering: { label: 'Delivering', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  picked_up: { label: 'Picked up', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'destructive' },
  failed: { label: 'Failed', tone: 'destructive' },
}

/** Segment badge tone, matching the tint already used for VIP/etc. elsewhere. */
const SEGMENT_META = {
  vip: { label: 'VIP customer', tone: 'warning' as ChipTone },
  regular: { label: 'Regular customer', tone: 'neutral' as ChipTone },
  new: { label: 'New customer', tone: 'info' as ChipTone },
}

/**
 * @description Customer profile drawer showing metrics and order history.
 */
export const CustomerProfileDrawer: FC<CustomerProfileDrawerProps> = ({
  customer,
  metrics,
  orders,
  onClose,
  onAssignPromo,
}) => {
  const valueScore = getCustomerValueScore(metrics)

  const formatter = new Intl.NumberFormat('id-ID')

  const segment = SEGMENT_META[metrics.segment]

  const initial = customer.name.trim().charAt(0).toUpperCase() || '?'

  return (
    <AppSheet
      open
      onOpenChange={(open) => { if (!open) onClose() }}
      title={<span className="sr-only">Customer {customer.name} profile</span>}
      headerClassName="sr-only"
      contentClassName="max-w-md p-4 text-foreground/90 sm:max-h-[90vh] sm:p-5"
    >
        {/* Header: avatar + identity on the left, activity/close on the
            right — mirrors the customer list row treatment (initial avatar)
            so this reads as the same customer, not a disconnected panel. */}
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary ring-1 ring-primary/15">
              {initial}
            </span>
            <div className="min-w-0 space-y-1.5">
              <p className="text-2xs font-semibold text-muted-foreground">
                Customer
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold leading-6 text-foreground">
                  {customer.name}
                </h2>
                <StatusChip tone={segment.tone} showDot={false} className="px-2 py-0.5 text-2xs">
                  {segment.label}
                </StatusChip>
              </div>
              <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MessageCircle className="size-4" />
                {customer.whatsappNumber}
                {customer.email ? ` · ${customer.email}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                Value score {valueScore}/100
              </p>
            </div>
          </div>

        </header>

        {/* Scrollable body: stats, notes, order history. Kept as one scroll
            region (min-h-0 so it actually shrinks within the flex column)
            rather than three separately-scrolling boxes, and the footer
            lives outside it entirely so it can never overlap content. */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pb-4 pt-0.5">
          <section className="grid grid-cols-2 gap-3 rounded-lg bg-card px-3 py-3 ring-1 ring-border/70">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Wallet className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-2xs font-semibold text-muted-foreground">
                  Lifetime spend
                </p>
                <p className="text-sm font-semibold leading-5 text-foreground">
                  Rp {formatter.format(metrics.lifetimeSpend)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ShoppingBag className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-2xs font-semibold text-muted-foreground">
                  Orders
                </p>
                <p className="text-sm font-semibold leading-5 text-foreground">
                  {metrics.orderCount}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <TrendingUp className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-2xs font-semibold text-muted-foreground">
                  Avg order value
                </p>
                <p className={metrics.averageOrderValue != null ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground/45'}>
                  {metrics.averageOrderValue != null
                    ? `Rp ${formatter.format(metrics.averageOrderValue)}`
                    : 'Not available'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MapPin className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-2xs font-semibold text-muted-foreground">
                  Preferred branch
                </p>
                <p className={(metrics.mostUsedBranch ?? customer.preferredBranch) ? 'truncate text-sm font-semibold text-foreground' : 'truncate text-sm text-muted-foreground/45'}>
                  {metrics.mostUsedBranch ?? customer.preferredBranch ?? 'Not set'}
                </p>
              </div>
            </div>
          </section>

          <section className={`space-y-1.5 rounded-lg px-3 py-2.5 ${customer.notes || (customer.tags && customer.tags.length > 0) ? 'bg-muted' : 'bg-muted/20 ring-1 ring-border/30'}`}>
            <p className={`text-2xs font-semibold ${customer.notes || (customer.tags && customer.tags.length > 0) ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
              Notes & tags
            </p>
            <div className="space-y-1.5">
              {customer.tags && customer.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {customer.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-card px-2.5 py-1 text-2xs font-medium text-foreground/90 ring-1 ring-border/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <p className={customer.notes ? 'text-sm text-foreground/90' : 'text-xs text-muted-foreground/45'}>
                {customer.notes ?? 'Not added'}
              </p>
            </div>
          </section>

          <section className={`space-y-1.5 rounded-lg px-3 py-2.5 ${orders.length > 0 ? 'bg-muted' : 'bg-muted/20 ring-1 ring-border/30'}`}>
            <p className={`text-2xs font-semibold ${orders.length > 0 ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
              Order history
            </p>
            {orders.length === 0 ? (
              <p className="text-xs text-muted-foreground/45">
                No linked orders
              </p>
            ) : (
              <ul className="space-y-1.5">
                {orders.map((order) => {
                  const statusMeta = ORDER_STATUS_META[order.status]
                  return (
                    <li
                      key={order.orderNumber}
                      className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 ring-1 ring-border/70"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {order.orderNumber}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {order.createdAtLabel} · {order.branch}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className="text-sm font-semibold leading-5 text-foreground">
                          Rp {formatter.format(order.totalIdr)}
                        </p>
                        <StatusChip tone={statusMeta.tone} className="px-2 py-0.5 text-2xs">
                          {statusMeta.label}
                        </StatusChip>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Actions: outside the scrollable body so it always sits below all
            content as a fixed dialog footer, never overlapping the last
            scrolled row. */}
        <footer className="shrink-0 isolate -mx-4 -mb-4 mt-0 flex flex-row flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-footer px-4 py-3 shadow-[0_-1px_0_rgba(0,0,0,0.02)] sm:-mx-5 sm:-mb-5 sm:rounded-b-3xl sm:px-5">
          <div className="flex items-center gap-2" />
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex cursor-pointer items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground sm:min-h-11 sm:text-xs rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onAssignPromo}
              className="tap-scale inline-flex cursor-pointer items-center rounded-full bg-primary text-sm font-medium text-white shadow-ios-sm hover:bg-primary/90 sm:min-h-11 sm:text-xs rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
            >
              <Ticket className="size-3.5" />
              Assign promo
            </button>
          </div>
        </footer>
    </AppSheet>
  )
}

export default CustomerProfileDrawer
