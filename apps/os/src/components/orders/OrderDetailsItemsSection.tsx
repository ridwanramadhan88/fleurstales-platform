import type { FC } from 'react'
import { CreditCard, Package2, User } from 'lucide-react'
import type { OrderStatus, PaymentMethod, PaymentStatus } from '../../types/orders'
import { StatusChip } from '../ui/chip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import {
  PAYMENT_CHIP_TONE,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_OPTIONS,
  STATUS_LABELS,
  getOrderStatusOptionsForFulfillment,
} from './orderTableLabels'
import { formatIdrText } from './orderTableFormatters'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { shouldHighlightReadyPayment } from '../../domain/orderPaymentGateDomain'

interface OrderDetailsItemsSectionProps {
  viewModel: OrderDetailsViewModel
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  transfer: 'Transfer',
}

export const OrderDetailsItemsSection: FC<OrderDetailsItemsSectionProps> = ({
  viewModel,
}) => {
  const {
    order,
    formatter,
    productDisplay,
    isOrderFuture,
    StatusIcon,
    isEditing,
    draft,
    onDraftChange,
    currentUserRole,
    onOpenFloristReassignment,
  } = viewModel

  const items = order.items?.length
    ? order.items
    : [
        {
          id: `${order.orderNumber}-legacy-line`,
          productId: order.productId,
          variantId: order.variantId,
          productName: productDisplay.name || order.productName || 'Custom order',
          quantity: 1,
          unitPriceIdr: order.itemsSubtotalIdr ?? order.totalIdr,
        },
      ]
  const itemsSubtotalIdr =
    order.itemsSubtotalIdr ??
    items.reduce((sum, item) => sum + item.unitPriceIdr * item.quantity, 0)
  const discountIdr = order.discountIdr ?? 0
  const deliveryFeeIdr = order.deliveryFeeIdr ?? 0
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card px-4 py-3.5 shadow-ios-sm ring-1 ring-black/[0.02]">
        {!isEditing ? (
          <>
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/15">
                <StatusIcon className="size-4 shrink-0" />
              </span>
              <span><span className="block text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Current status</span><span className="text-sm font-semibold text-foreground">{STATUS_LABELS[order.status]}</span></span>
            </span>
            <StatusChip
              tone={
                shouldHighlightReadyPayment(order)
                  ? 'warning'
                  : PAYMENT_CHIP_TONE[order.paymentStatus]
              }
            >
              {PAYMENT_STATUS_LABELS[order.paymentStatus]}
            </StatusChip>
          </>
        ) : (
          <div className="grid w-full gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-2xs font-medium text-muted-foreground/80">
              Status
              <Select
                value={draft.status}
                onValueChange={(value) => onDraftChange('status', value as OrderStatus)}
              >
                <SelectTrigger className="h-10 rounded-xl bg-card px-3 text-xs ring-1 ring-border/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getOrderStatusOptionsForFulfillment(draft.fulfillment, isOrderFuture).map(
                    (option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-2xs font-medium text-muted-foreground/80">
              Payment status
              <Select
                value={draft.paymentStatus}
                onValueChange={(value) =>
                  onDraftChange('paymentStatus', value as PaymentStatus)
                }
              >
                <SelectTrigger className="h-10 rounded-xl bg-card px-3 text-xs ring-1 ring-border/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-2xs font-medium text-muted-foreground/80">
              Payment method
              <Select
                value={draft.paymentMethod || 'none'}
                onValueChange={(value) =>
                  onDraftChange(
                    'paymentMethod',
                    value === 'none' ? '' : (value as PaymentMethod),
                  )
                }
              >
                <SelectTrigger className="h-10 rounded-xl bg-card px-3 text-xs ring-1 ring-border/70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        )}
      </section>

      {!isEditing && Boolean(order.paymentHistory?.length) && (
        <section className="space-y-2 border-b border-border/70 bg-transparent pb-4 pt-1 sm:rounded-xl sm:bg-card sm:px-3 sm:py-3 sm:ring-1 sm:ring-border/70">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/80">
              Payment history
            </p>
            <span className="text-2xs text-muted-foreground">
              {order.paymentHistory?.length} event{order.paymentHistory?.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="space-y-2">
            {[...(order.paymentHistory ?? [])].reverse().map((event) => (
              <div
                key={event.id}
                className="flex items-start justify-between gap-3 border-t border-border/50 pt-2 first:border-t-0 first:pt-0"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {event.type === 'payment_received'
                      ? 'Payment received'
                      : event.type === 'payment_reversed'
                        ? 'Payment reversed'
                        : event.type === 'refund_initiated'
                          ? 'Refund initiated'
                          : event.type === 'refund_completed'
                            ? 'Refund completed'
                            : 'Payment status adjusted'}
                  </p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {event.actorName} ·{' '}
                    {new Date(event.occurredAt).toLocaleString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <p className="shrink-0 text-xs font-semibold text-foreground">
                  {event.amountIdr > 0
                    ? `${event.type === 'payment_received' ? '+' : '-'}Rp ${formatter.format(event.amountIdr)}`
                    : PAYMENT_STATUS_LABELS[event.resultingStatus]}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-ios-sm ring-1 ring-black/[0.02]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Package2 className="size-3.5" />
            </span>
            <div>
              <p className="text-sm font-semibold leading-5 text-foreground">Order summary</p>
              <p className="text-2xs text-muted-foreground">
                {itemCount} item{itemCount === 1 ? '' : 's'} · {items.length} line{items.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          {!isEditing && (
            <p className="text-sm font-semibold leading-5 text-foreground">Rp {formatter.format(order.totalIdr)}</p>
          )}
        </div>

        <div className="divide-y divide-border/60 rounded-lg border border-border/60">
          {items.map((item, index) => {
            const lineTotal = item.unitPriceIdr * item.quantity
            const isEditableCustomLine =
              isEditing && items.length === 1 && !item.productId && index === 0
            return (
              <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  {isEditableCustomLine ? (
                    <input
                      value={draft.productName}
                      onChange={(event) => onDraftChange('productName', event.target.value)}
                      className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      placeholder="Product / item name"
                    />
                  ) : (
                    <p className="text-sm font-semibold leading-5 text-foreground">
                      {item.productName || productDisplay.name || 'Custom order'}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.quantity} × Rp {formatter.format(item.unitPriceIdr)}
                    {item.variantId ? ` · Variant ${item.variantId}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-foreground">
                  Rp {formatter.format(lineTotal)}
                </p>
              </div>
            )
          })}
        </div>

        <div className="ml-auto w-full max-w-xs space-y-1.5 text-xs">
          <div className="flex justify-between gap-3 text-muted-foreground">
            <span>Items subtotal</span>
            <span>Rp {formatter.format(itemsSubtotalIdr)}</span>
          </div>
          {discountIdr > 0 && (
            <div className="flex justify-between gap-3 text-success">
              <span>Discount{order.promoCode ? ` · ${order.promoCode}` : ''}</span>
              <span>−Rp {formatter.format(discountIdr)}</span>
            </div>
          )}
          {deliveryFeeIdr > 0 && (
            <div className="flex justify-between gap-3 text-muted-foreground">
              <span>Delivery fee</span>
              <span>Rp {formatter.format(deliveryFeeIdr)}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-1.5 text-sm font-semibold text-foreground">
            <span>Total</span>
            {isEditing ? (
              <div className="flex items-center gap-1">
                <span>Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.totalIdrText}
                  onChange={(event) =>
                    onDraftChange('totalIdrText', formatIdrText(event.target.value))
                  }
                  className="h-9 w-28 rounded-lg border border-border bg-background px-3 text-right text-sm"
                />
              </div>
            ) : (
              <span>Rp {formatter.format(order.totalIdr)}</span>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CreditCard className="size-3.5" />
            </span>
            <div>
              <p className="text-2xs font-medium text-muted-foreground/80">Payment method</p>
              <p className="text-sm font-medium text-foreground">
                {order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] : 'Not set'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-panel px-3 py-2.5 ring-1 ring-border/60">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border/60">
                <User className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-2xs font-medium text-muted-foreground/80">Assigned florist</p>
                <p className="truncate text-sm font-semibold text-foreground">
                  {order.florist ?? 'Assigned when Processing starts'}
                </p>
              </div>
            </div>
            {!isEditing && order.floristAssignedEmployeeId && ['admin', 'owner'].includes(currentUserRole) && !['delivered', 'picked_up', 'cancelled', 'failed'].includes(order.status) && (
              <button type="button" onClick={onOpenFloristReassignment} className="h-9 shrink-0 rounded-full bg-foreground px-3.5 text-xs font-semibold text-background shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                Change
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
