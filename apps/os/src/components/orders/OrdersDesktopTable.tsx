import { Fragment, type FC } from 'react'
import { MapPin, Truck } from 'lucide-react'
import { StatusChip } from '../ui/chip'
import {
  ORDER_CARD_BG,
  PAYMENT_DOT_TONE,
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

type RowRefSetter = (key: string) => (node: HTMLElement | null) => void

interface OrdersDesktopTableProps {
  viewModel: OrdersTableViewModel
  setDesktopRowRef: RowRefSetter
}

const ColumnHeader: FC<{ label: string; align?: 'left' | 'right' }> = ({
  label,
  align = 'left',
}) => (
  <span className={`text-xs font-semibold tracking-wide text-muted-foreground ${align === 'right' ? 'text-right' : 'text-left'}`}>
    {label}
  </span>
)

const slotKey = (order: OrdersTableViewModel['sortedOrders'][number]) =>
  `${order.scheduleDate ?? ''}|${order.scheduleTime?.slice(0, 5) ?? ''}`

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
    onOpenDetails,
  } = viewModel

  const displayOrders = activeScope === 'future'
    ? [...sortedOrders].sort((a, b) => getEtaTimestamp(a) - getEtaTimestamp(b))
    : sortedOrders

  return (
    <>
      <div className="hidden overflow-hidden rounded-xs bg-card/90 ring-1 ring-border/60 lg:block lg:w-full lg:rounded-xl">
        <div className="min-w-full text-sm text-foreground/90 sm:text-sm">
          <div className="flex items-center gap-3 bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
            <div className="min-w-0 flex-1"><ColumnHeader label="ORDER" /></div>
            <div className="w-[150px] shrink-0"><ColumnHeader label="TIME" /></div>
            <div className="w-[110px] shrink-0"><ColumnHeader label="FULFILLMENT" /></div>
            <div className="w-[120px] shrink-0"><ColumnHeader label="STATUS" /></div>
            <div className="w-[90px] shrink-0"><ColumnHeader label="FLORIST" /></div>
            <div className="w-[130px] shrink-0"><ColumnHeader label="TOTAL" /></div>
          </div>

          {displayOrders.map((order, index) => {
            const urgency = getOrderUrgency(order)
            const StatusIcon = STATUS_ICONS[order.status]
            const isFutureCustomOrder = activeScope === 'custom' && isFutureOrder(order)
            const isNewOrder = STATUS_GROUP_FROM_STATUS[order.status] === 'new'
            const highlightPayment = shouldHighlightReadyPayment(order)
            const showFutureDivider = activeScope === 'future' && (index === 0 || slotKey(displayOrders[index - 1]) !== slotKey(order))

            return (
              <Fragment key={order.orderNumber}>
                {showFutureDivider && (
                  <div className="border-t border-border/70 bg-muted/55 px-4 py-2 text-xs font-semibold text-foreground/75">
                    {getDisplayScheduleLabel(order) ?? `${order.scheduleDate ?? ''} · ${order.scheduleTime ?? ''}`}
                  </div>
                )}
                <div
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
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-base font-semibold leading-6 text-foreground">{order.customerName}</span>
                      {isNewOrder && (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-primary">New</span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-medium text-foreground/90">{getProductName(order)}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{order.orderNumber}</div>
                  </div>

                  <div className="flex w-[150px] shrink-0 items-center">
                    {urgency === 'late' || urgency === 'dueSoon' || isFutureCustomOrder ? (
                      <StatusChip tone={isFutureCustomOrder ? 'info' : URGENCY_CHIP[urgency].tone} className="px-2 py-0.5 text-xs">
                        {getDisplayScheduleLabel(order) ?? URGENCY_CHIP[urgency].label}
                      </StatusChip>
                    ) : (
                      <span className="truncate text-xs text-muted-foreground">{getDisplayScheduleLabel(order) ?? URGENCY_CHIP[urgency].label}</span>
                    )}
                  </div>

                  <div className="flex w-[110px] shrink-0 items-center gap-1.5 text-muted-foreground">
                    {order.fulfillment === 'delivery' ? <Truck className="size-3.5 shrink-0" /> : <MapPin className="size-3.5 shrink-0" />}
                    <span className="truncate">{order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</span>
                  </div>

                  <div className="flex w-[120px] shrink-0 items-center gap-1.5 text-foreground/90">
                    <StatusIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate text-2xs font-medium">{STATUS_LABELS[order.status]}</span>
                  </div>

                  <div className="w-[90px] shrink-0 truncate text-muted-foreground">
                    {order.florist ? order.florist : <span className="text-muted-foreground">—</span>}
                  </div>

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
                      <span className="block font-semibold text-foreground">Rp {formatter.format(order.totalIdr)}</span>
                      {highlightPayment && <span className="block text-2xs font-semibold text-warning">{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>}
                    </span>
                  </div>
                </div>
              </Fragment>
            )
          })}

          {displayedOrderCount === 0 && (
            <div className="border-t border-border/70 bg-muted px-5 py-4 text-center text-sm text-muted-foreground">{emptyStateMessage}</div>
          )}
        </div>
      </div>
    </>
  )
}
