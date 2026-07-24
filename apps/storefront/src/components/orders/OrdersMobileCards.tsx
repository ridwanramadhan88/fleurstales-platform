import type { FC } from 'react'
import { ArrowRight, ClipboardList } from 'lucide-react'
import { StatusChip } from '../ui/chip'
import {
  ORDER_CARD_BG,
  PAYMENT_CHIP_TONE,
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
import { shouldGateOrderAdvanceForPayment } from '../../domain/orderPaymentGateDomain'
import { shouldHighlightReadyPayment } from '../../domain/orderPaymentGateDomain'

type CardRefSetter = (key: string) => (node: HTMLElement | null) => void

interface OrdersMobileCardsProps {
  viewModel: OrdersTableViewModel
  setCardRef: CardRefSetter
}

export const OrdersMobileCards: FC<OrdersMobileCardsProps> = ({
  viewModel,
  setCardRef,
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
      {/* Mobile card view */}
      <div className="space-y-3 lg:hidden">
        {sortedOrders.map((order) => {
          const urgency = getOrderUrgency(order)
          const StatusIcon = STATUS_ICONS[order.status]
          const isFutureCustomOrder =
            activeScope === 'custom' && isFutureOrder(order)
          const isNewOrder = STATUS_GROUP_FROM_STATUS[order.status] === 'new'
          const paymentNeedsAttention =
            order.paymentStatus === 'refund_pending' ||
            isPaymentOverdue(order) ||
            shouldHighlightReadyPayment(order)
          const highlightPayment = shouldHighlightReadyPayment(order)
          const cardNextStatus = getNextStatusForOrder(order)
          const paymentBlocked = Boolean(cardNextStatus && shouldGateOrderAdvanceForPayment(order, cardNextStatus))

          return (
            <div
              key={order.orderNumber}
              ref={setCardRef(order.orderNumber)}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDetails(order)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onOpenDetails(order)
                }
              }}
              className={`w-full cursor-pointer rounded-xl border-l-4 bg-surface-card px-4 py-3.5 text-left shadow-ios-sm ring-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                isNewOrder
                  ? `border-l-primary/60 ${ORDER_CARD_BG[order.status]} ring-border/70`
                  : `border-l-transparent ${ORDER_CARD_BG[order.status]} ring-border/70`
              }`}
            >
              {/* Line 1: customer name (biggest) + price */}
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-base font-semibold leading-tight text-foreground">
                    {order.customerName}
                  </span>
                  {isNewOrder && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary">
                      New
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-base font-semibold leading-tight text-foreground">
                  Rp {formatter.format(order.totalIdr)}
                </span>
              </div>

              {/* Line 2: product name, with the order number on its own
                  line directly underneath (previously crammed onto one
                  line with a "·" separator, which truncated on longer
                  product names) + payment status aligned to the top of
                  the two-line block. */}
              <div className="mt-1 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground/90">
                    {getProductName(order)}
                  </div>
                  <div className="truncate text-2xs leading-tight text-muted-foreground">
                    {order.orderNumber}
                  </div>
                </div>
                {paymentNeedsAttention ? (
                  <StatusChip
                    tone={
                      highlightPayment
                        ? 'warning'
                        : PAYMENT_CHIP_TONE[order.paymentStatus]
                    }
                    className="shrink-0 px-2 py-0.5 text-xs"
                  >
                    {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                  </StatusChip>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                  </span>
                )}
              </div>

              {/* Line 3: status icon + florist + fulfillment (no color), plus
                  a time chip that's always colored — red under 1h/overdue,
                  yellow under 2h, blue beyond that — so urgency is the one
                  thing that pops. */}
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-4">
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusIcon className="size-3.5 shrink-0" />
                  <span className="truncate">{STATUS_LABELS[order.status]} · {order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</span>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {getDisplayScheduleLabel(order) && (
                    <StatusChip
                      tone={
                        isFutureCustomOrder ? 'info' : URGENCY_CHIP[urgency].tone
                      }
                      showDot={false}
                      className="px-2 py-0.5 text-xs"
                    >
                      {getDisplayScheduleLabel(order)}
                    </StatusChip>
                  )}
                  {/* One-tap quick advance, so staff on a phone don't have to
                      open the full details panel just to bump an order along
                      (bug 5 — previously only the desktop table would have
                      had this). Colored to match the status it advances
                      into; the terminal step shows "Finished" with a check
                      instead of the raw delivered/picked-up status name. */}
                  {cardNextStatus && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!paymentBlocked) onQuickAdvance(order)
                      }}
                      disabled={paymentBlocked}
                      title={paymentBlocked ? 'Complete payment before continuing.' : `Advance to ${getQuickActionLabel(cardNextStatus)}`}
                      aria-label={paymentBlocked ? 'Complete payment before continuing' : `Advance order to ${getQuickActionLabel(cardNextStatus)}`}
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${paymentBlocked ? 'cursor-not-allowed bg-muted text-muted-foreground ring-1 ring-border' : `cursor-pointer ${QUICK_ACTION_BUTTON_STYLE[cardNextStatus].className}`}`}
                    >
                      {getQuickActionLabel(cardNextStatus)}
                      <ArrowRight className="size-3.5 shrink-0" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {displayedOrderCount === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl bg-surface-card px-6 py-8 text-center ring-1 ring-border">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ClipboardList className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold leading-5 text-foreground">No orders found</p>
              <p className="text-xs text-muted-foreground">{emptyStateMessage}</p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
