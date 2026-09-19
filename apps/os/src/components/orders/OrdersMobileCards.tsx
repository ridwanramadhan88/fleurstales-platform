import { Fragment, type FC } from 'react'
import { ClipboardList } from 'lucide-react'
import { StatusChip } from '../ui/chip'
import {
  ORDER_CARD_BG,
  PAYMENT_CHIP_TONE,
  PAYMENT_STATUS_LABELS,
  STATUS_GROUP_FROM_STATUS,
  STATUS_ICONS,
  STATUS_LABELS,
  URGENCY_CHIP,
} from './orderTableLabels'
import {
  getDisplayScheduleLabel,
  getOrderUrgency,
  isFutureOrder,
  isPaymentOverdue,
} from './orderTableFormatters'
import { getEtaTimestamp } from './orderTableSorting'
import type { OrdersTableViewModel } from './OrdersTableViewController'
import { shouldHighlightReadyPayment } from '../../domain/orderPaymentGateDomain'

type CardRefSetter = (key: string) => (node: HTMLElement | null) => void

interface OrdersMobileCardsProps {
  viewModel: OrdersTableViewModel
  setCardRef: CardRefSetter
}

const slotKey = (order: OrdersTableViewModel['sortedOrders'][number]) =>
  `${order.scheduleDate ?? ''}|${order.scheduleTime?.slice(0, 5) ?? ''}`

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
    onOpenDetails,
  } = viewModel

  const displayOrders = activeScope === 'future'
    ? [...sortedOrders].sort((a, b) => getEtaTimestamp(a) - getEtaTimestamp(b))
    : sortedOrders

  return (
    <>
      <div className="space-y-3 lg:hidden">
        {displayOrders.map((order, index) => {
          const urgency = getOrderUrgency(order)
          const StatusIcon = STATUS_ICONS[order.status]
          const isFutureCustomOrder = activeScope === 'custom' && isFutureOrder(order)
          const isNewOrder = STATUS_GROUP_FROM_STATUS[order.status] === 'new'
          const paymentNeedsAttention =
            order.paymentStatus === 'refund_pending' ||
            isPaymentOverdue(order) ||
            shouldHighlightReadyPayment(order)
          const highlightPayment = shouldHighlightReadyPayment(order)
          const showFutureDivider = activeScope === 'future' && (index === 0 || slotKey(displayOrders[index - 1]) !== slotKey(order))

          return (
            <Fragment key={order.orderNumber}>
              {showFutureDivider && (
                <div className="flex items-center gap-3 pt-1 text-xs font-semibold text-muted-foreground">
                  <span className="whitespace-nowrap">{getDisplayScheduleLabel(order) ?? `${order.scheduleDate ?? ''} · ${order.scheduleTime ?? ''}`}</span>
                  <span className="h-px flex-1 bg-border/70" />
                </div>
              )}
              <div
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
                className={`w-full cursor-pointer rounded-xl border-l-4 bg-surface-card px-3.5 py-3 text-left shadow-ios-sm ring-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:px-4 sm:py-3.5 ${
                  isNewOrder
                    ? `border-l-primary/60 ${ORDER_CARD_BG[order.status]} ring-border/70`
                    : `border-l-transparent ${ORDER_CARD_BG[order.status]} ring-border/70`
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-base font-semibold leading-tight text-foreground">{order.customerName}</span>
                    {isNewOrder && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary">New</span>
                    )}
                  </span>
                  <span className="shrink-0 text-base font-semibold leading-tight text-foreground">Rp {formatter.format(order.totalIdr)}</span>
                </div>

                <div className="mt-1.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold leading-4 text-muted-foreground">{order.orderNumber}</div>
                    <div className="mt-0.5 line-clamp-2 text-sm font-medium leading-5 text-foreground/90">{getProductName(order)}</div>
                  </div>
                  {paymentNeedsAttention ? (
                    <StatusChip
                      tone={highlightPayment ? 'warning' : PAYMENT_CHIP_TONE[order.paymentStatus]}
                      className="shrink-0 px-2 py-0.5 text-xs"
                    >
                      {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                    </StatusChip>
                  ) : (
                    <span className="shrink-0 text-xs leading-5 text-muted-foreground">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
                  )}
                </div>

                <div className="mt-3 flex items-start justify-between gap-3 border-t border-border/70 pt-3 sm:mt-4 sm:pt-4">
                  <div className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                    <StatusIcon className="mt-0.5 size-3.5 shrink-0" />
                    <span className="min-w-0 leading-4">
                      <span className="font-medium text-foreground/80">{STATUS_LABELS[order.status]}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</span>
                    </span>
                  </div>

                  {getDisplayScheduleLabel(order) && (
                    <StatusChip
                      tone={isFutureCustomOrder ? 'info' : URGENCY_CHIP[urgency].tone}
                      showDot={false}
                      className="max-w-[48%] shrink-0 whitespace-normal px-2 py-0.5 text-right text-xs leading-4"
                    >
                      {getDisplayScheduleLabel(order)}
                    </StatusChip>
                  )}
                </div>
              </div>
            </Fragment>
          )
        })}

        {displayedOrderCount === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl bg-surface-card px-6 py-8 text-center shadow-ios-sm ring-1 ring-border/60">
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
