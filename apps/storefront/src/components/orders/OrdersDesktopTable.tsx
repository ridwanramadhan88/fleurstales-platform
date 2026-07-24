import type { FC } from 'react'
import { ArrowRight, MapPin, Truck } from 'lucide-react'
import { StatusChip } from '../ui/chip'
import {
  ORDER_CARD_BG,
  PAYMENT_DOT_TONE,
  PAYMENT_STATUS_LABELS,
  QUICK_ACTION_BUTTON_STYLE,
  STATUS_GROUP_FROM_STATUS,
  STATUS_ICONS,
  STATUS_LABELS,
  URGENCY_CHIP,
  getQuickActionLabel,
} from './orderTableLabels'
import {
  getDisplayScheduleLabel,
  getOrderUrgency,
  isFutureOrder,
  isPaymentOverdue,
} from './orderTableFormatters'
import type { OrdersTableViewModel } from './OrdersTableViewController'
import { shouldGateOrderAdvanceForPayment, shouldHighlightReadyPayment } from '../../domain/orderPaymentGateDomain'

type RowRefSetter = (key: string) => (node: HTMLElement | null) => void

interface OrdersDesktopTableProps {
  viewModel: OrdersTableViewModel
  setDesktopRowRef: RowRefSetter
}

const ColumnHeader: FC<{ label: string; align?: 'left' | 'right' }> = ({
  label,
  align = 'left',
}) => (
  <span
    className={`text-xs font-semibold tracking-wide text-muted-foreground ${
      align === 'right' ? 'text-right' : 'text-left'
    }`}
  >
    {label}
  </span>
)

export const OrdersDesktopTable: FC<OrdersDesktopTableProps> = ({
  viewModel,
  setDesktopRowRef,
}) => {
  const {
    activeScope,
    displayedOrderCount,
    sortedOrders,
    formatter,
    emptyStateMessage,
    getProductName,
    getNextStatusForOrder,
    onOpenDetails,
    onQuickAdvance,
  } = viewModel

  return (
    <>
      {/* Desktop / tablet table view */}
      <div className="hidden overflow-hidden rounded-xs bg-card/90 ring-1 ring-border/60 lg:block lg:w-full lg:rounded-xl">
        <div className="min-w-full text-sm text-foreground/90 sm:text-sm">
          {/* Header row */}
          <div className="flex items-center gap-3 bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
            <div className="min-w-0 flex-1">
              <ColumnHeader label="ORDER" />
            </div>
            <div className="w-[120px] shrink-0">
              <ColumnHeader label="FULFILLMENT" />
            </div>
            <div className="w-[150px] shrink-0">
              <ColumnHeader label="STATUS" />
            </div>
            <div className="w-[90px] shrink-0">
              <ColumnHeader label="FLORIST" />
            </div>
            <div className="w-[130px] shrink-0">
              <ColumnHeader label="TOTAL" />
            </div>
            <span className="w-[130px] shrink-0 pl-2 text-xs font-semibold tracking-wide text-muted-foreground">
              QUICK ACTION
            </span>
          </div>

          {/* Rows */}
          {sortedOrders.map((order) => {
            const urgency = getOrderUrgency(order)
            const StatusIcon = STATUS_ICONS[order.status]
            const isFutureCustomOrder =
              activeScope === 'custom' && isFutureOrder(order)
            const isNewOrder = STATUS_GROUP_FROM_STATUS[order.status] === 'new'
            const rowNextStatus = getNextStatusForOrder(order)
            const highlightPayment = shouldHighlightReadyPayment(order)
            const paymentBlocked = Boolean(rowNextStatus && shouldGateOrderAdvanceForPayment(order, rowNextStatus))
            return (
              <div
                key={order.orderNumber}
                ref={setDesktopRowRef(order.orderNumber)}
                role="button"
                tabIndex={0}
                onClick={() => onOpenDetails(order)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpenDetails(order)
                  }
                }}
                className={`flex w-full cursor-pointer items-center gap-3 border-t px-4 py-4 text-left text-sm text-foreground/90 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 sm:text-sm ${
                  isNewOrder
                    ? `border-l-4 border-l-primary/60 ${ORDER_CARD_BG[order.status]}`
                    : `border-l-4 border-l-transparent border-border/70 ${ORDER_CARD_BG[order.status]}`
                }`}
              >
                {/* Customer name on top, product name + order number
                    underneath (matches the mobile card identity block) so
                    the customer is scannable at a glance and the order
                    detail reads as secondary metadata. */}
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-base font-semibold leading-6 text-foreground">
                      {order.customerName}
                    </span>
                    {isNewOrder && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary">
                        New
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-medium text-foreground/90">
                    {getProductName(order)}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {order.orderNumber}
                  </div>
                </div>

                {/* Fulfillment */}
                <div className="flex w-[120px] shrink-0 items-center gap-1.5 text-muted-foreground">
                  {order.fulfillment === 'delivery' ? (
                    <Truck className="size-3.5 shrink-0" />
                  ) : (
                    <MapPin className="size-3.5 shrink-0" />
                  )}
                  <span>
                    {order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
                  </span>
                </div>

                {/* Status: icon + plain text, no color — color is reserved
                    for the time chip below, which always carries a color
                    (red/yellow/blue) so staff can scan urgency at a glance. */}
                <div className="flex w-[150px] shrink-0 flex-col items-start gap-1">
                  <span className="inline-flex items-center gap-1.5 text-foreground/90">
                    <StatusIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-2xs font-medium">
                      {STATUS_LABELS[order.status]}
                    </span>
                  </span>
                  {urgency === 'late' || urgency === 'dueSoon' || isFutureCustomOrder ? (
                    <StatusChip tone={isFutureCustomOrder ? 'info' : URGENCY_CHIP[urgency].tone} className="px-2 py-0.5 text-xs">
                      {getDisplayScheduleLabel(order) ?? URGENCY_CHIP[urgency].label}
                    </StatusChip>
                  ) : (
                    <span className="text-xs text-muted-foreground">{getDisplayScheduleLabel(order) ?? URGENCY_CHIP[urgency].label}</span>
                  )}
                </div>

                {/* Florist */}
                <div className="w-[90px] shrink-0 truncate text-muted-foreground">
                  {order.florist ? (
                    order.florist
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>

                {/* Total: payment dot — colored only once an unpaid order
                    has been sitting that way for 5+ hours after being
                    processed, which is a real problem. A brand-new order,
                    or one unpaid for only a short while, stays neutral. */}
                <div className="flex w-[130px] shrink-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      highlightPayment
                        ? 'bg-warning'
                        : order.paymentStatus === 'unpaid' && !isPaymentOverdue(order)
                        ? 'bg-muted-foreground/40'
                        : PAYMENT_DOT_TONE[order.paymentStatus]
                    }`}
                    title={`Payment: ${PAYMENT_STATUS_LABELS[order.paymentStatus]}`}
                    aria-label={`Payment status: ${PAYMENT_STATUS_LABELS[order.paymentStatus]}`}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">
                      Rp {formatter.format(order.totalIdr)}
                    </span>
                    {highlightPayment && (
                      <span className="block text-2xs font-semibold text-warning">
                        {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                      </span>
                    )}
                  </span>
                </div>

                {/* Quick action: one-tap status advance (bug 5, with the
                    same undo-able toast as the details panel's Next status
                    button, bug 4). Its own column so it doesn't compete with
                    Total for space. */}
                <div className="flex w-[130px] shrink-0 items-center justify-end pr-1">
                  {rowNextStatus ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!paymentBlocked) onQuickAdvance(order)
                      }}
                      disabled={paymentBlocked}
                      title={paymentBlocked ? 'Complete payment before continuing.' : `Advance to ${getQuickActionLabel(rowNextStatus)}`}
                      aria-label={paymentBlocked ? 'Complete payment before continuing' : `Advance order to ${getQuickActionLabel(rowNextStatus)}`}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${paymentBlocked ? 'cursor-not-allowed bg-muted text-muted-foreground ring-1 ring-border' : `cursor-pointer ${QUICK_ACTION_BUTTON_STYLE[rowNextStatus].className}`}`}
                    >
                      {getQuickActionLabel(rowNextStatus)}
                      <ArrowRight className="size-3.5 shrink-0" />
                    </button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            )
          })}

          {displayedOrderCount === 0 && (
            <div className="border-t border-border/70 bg-muted px-5 py-4 text-center text-sm text-muted-foreground">
              {emptyStateMessage}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
