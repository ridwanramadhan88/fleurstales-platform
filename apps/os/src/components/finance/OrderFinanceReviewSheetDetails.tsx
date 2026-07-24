import type { FC } from 'react'
import { AlertTriangle, Clock, CreditCard, FileCheck2, MapPin, MessageCircle, Smartphone, Truck, User } from 'lucide-react'
import {
  SOURCE_LABELS,
  STATUS_LABELS,
} from '../orders/orderTableLabels'
import { getActualPickupLabel, getDisplayScheduleLabel, getRequestedPickupLabel } from '../orders/orderTableFormatters'
import { formatIdrCurrency } from '../../lib/formatters'
import type { OrderFinanceReviewSheetViewModel } from './OrderFinanceReviewSheetController'

/**
 * @description Read-only order fields: status/payment strip, product +
 * price + florist, source/fulfillment/schedule, greeting card, promo code,
 * and internal note. Split out of `OrderFinanceReviewSheet.tsx`.
 */

type OrderFinanceReviewSheetDetailsProps = Pick<
  OrderFinanceReviewSheetViewModel,
  'order' | 'productName' | 'StatusIcon'
>

export const OrderFinanceReviewSheetDetails: FC<OrderFinanceReviewSheetDetailsProps> = ({
  order,
  productName,
  StatusIcon,
}) => {
  const paidAmount = order.paidAmountIdr ?? (order.paymentStatus === 'paid' ? order.totalIdr : 0)
  const remainingBalance = Math.max(0, order.totalIdr - paidAmount)
  const latestPayment = [...(order.paymentHistory ?? [])]
    .filter((event) => event.type === 'payment_received' || event.type === 'payment_status_adjusted')
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  const paymentMethod = latestPayment?.method ?? order.paymentMethod
  const paymentMismatch =
    (order.paymentStatus === 'paid' && paidAmount !== order.totalIdr) ||
    (order.paymentStatus === 'partial' && (paidAmount <= 0 || paidAmount >= order.totalIdr)) ||
    (order.paymentStatus === 'unpaid' && paidAmount > 0)

  return (
    <div className="space-y-3 sm:col-span-3">
      {/* Fulfillment status is shown once here; payment status already lives in the Finance banner. */}
      <section className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-3 shadow-ios-sm">
        <span className="inline-flex items-center gap-1.5 text-foreground/90">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <StatusIcon className="size-3.5" />
          </span>
          <span className="text-sm font-medium">{STATUS_LABELS[order.status]}</span>
        </span>
      </section>

      {/* Finance evidence — keep the decision-critical payment data together. */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-ios-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CreditCard className="size-3.5" />
            </span>
            <div>
              <p className="text-2xs font-semibold text-muted-foreground">Payment evidence</p>
              <p className="text-sm font-semibold leading-5 text-foreground">
                {paymentMethod === 'transfer' ? 'Bank transfer' : paymentMethod === 'cash' ? 'Cash' : 'Method not recorded'}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground">
            <FileCheck2 className="size-3.5" />
            {latestPayment?.proofId ? 'Proof attached' : 'No proof attached'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-panel p-2.5">
          <div>
            <p className="text-2xs font-semibold text-muted-foreground">Order total</p>
            <p className="mt-0.5 text-xs font-semibold text-foreground">{formatIdrCurrency(order.totalIdr)}</p>
          </div>
          <div>
            <p className="text-2xs font-semibold text-muted-foreground">Paid</p>
            <p className="mt-0.5 text-xs font-semibold text-foreground">{formatIdrCurrency(paidAmount)}</p>
          </div>
          <div>
            <p className="text-2xs font-semibold text-muted-foreground">Balance</p>
            <p className="mt-0.5 text-xs font-semibold text-foreground">{formatIdrCurrency(remainingBalance)}</p>
          </div>
        </div>

        {(latestPayment?.reference || latestPayment?.note) && (
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            {latestPayment.reference && (
              <div>
                <p className="text-2xs font-semibold text-muted-foreground">Transaction reference</p>
                <p className="mt-0.5 break-all font-medium text-foreground">{latestPayment.reference}</p>
              </div>
            )}
            {latestPayment.note && (
              <div>
                <p className="text-2xs font-semibold text-muted-foreground">Payment note</p>
                <p className="mt-0.5 text-foreground/90">{latestPayment.note}</p>
              </div>
            )}
          </div>
        )}

        {paymentMismatch && (
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-2.5 py-2 text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold">Payment status and amount do not match</p>
              <p className="mt-0.5 text-2xs text-warning/90">Review the paid amount and payment history before verifying.</p>
            </div>
          </div>
        )}
      </section>

      <details className="rounded-xl border border-border bg-card p-3 shadow-ios-sm">
        <summary className="cursor-pointer text-sm font-semibold h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap">Fulfillment and order details</summary>
        <div className="mt-3 space-y-3">
      {/* Product + price + florist */}
      <section className="space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-ios-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-2xs font-semibold text-muted-foreground">Product</p>
            <p className="truncate text-sm font-semibold text-foreground sm:text-base">
              {productName || (
                <span className="font-normal text-muted-foreground">Not set</span>
              )}
            </p>
          </div>
          <div className="shrink-0 space-y-0.5 text-right">
            <p className="text-2xs font-semibold text-muted-foreground">Order total</p>
            <p className="text-sm font-semibold text-foreground sm:text-base">
              {formatIdrCurrency(order.totalIdr)}
            </p>
          </div>
        </div>

        <div className="h-px bg-border/60" />

        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="size-3.5" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-2xs font-semibold text-muted-foreground">Florist</p>
            <p className="truncate text-sm font-medium text-foreground/90">
              {order.florist ?? (
                <span className="font-normal text-muted-foreground">Not assigned</span>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Source / fulfillment / schedule */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-ios-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {order.source === 'whatsapp' ? (
                <MessageCircle className="size-3.5" />
              ) : (
                <Smartphone className="size-3.5" />
              )}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-2xs font-semibold text-muted-foreground">Source</p>
              <p className="truncate text-sm font-medium text-foreground/90">
                {SOURCE_LABELS[order.source]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              {order.fulfillment === 'delivery' ? (
                <Truck className="size-3.5" />
              ) : (
                <MapPin className="size-3.5" />
              )}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="text-2xs font-semibold text-muted-foreground">Fulfillment</p>
              <p className="truncate text-sm font-medium text-foreground/90">
                {order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
              </p>
            </div>
          </div>
          <div className="col-span-2 flex items-start gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Clock className="size-3.5" />
            </span>
            <div className="min-w-0 space-y-2 leading-tight">
              {order.fulfillment === 'pickup' ? (
                <>
                  <div>
                    <p className="text-2xs font-semibold text-muted-foreground">Requested pickup</p>
                    <p className="text-sm font-medium text-foreground/90">{getRequestedPickupLabel(order) ?? '—'}</p>
                  </div>
                  {order.status === 'picked_up' ? (
                    <div>
                      <p className="text-2xs font-semibold text-muted-foreground">Actual pickup</p>
                      <p className="text-sm font-medium text-foreground/90">{getActualPickupLabel(order) ?? '—'}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div>
                  <p className="text-2xs font-semibold text-muted-foreground">Delivery schedule</p>
                  <p className="text-sm font-medium text-foreground/90">{getDisplayScheduleLabel(order) ?? '—'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Greeting card / gift message (read-only) */}
      <section className="rounded-xl border border-border bg-card p-3 shadow-ios-sm">
        <p className="text-2xs font-semibold text-muted-foreground">Greeting card message</p>
        <p className="mt-0.5 text-sm text-foreground/90 sm:text-sm">
          {order.greetingMessage ?? order.giftMessage ?? 'No greeting message for this order.'}
        </p>
      </section>

      {/* Promo code */}
      {order.promoCode && (
        <section className="rounded-xl border border-primary/20 bg-primary/10 p-3 shadow-ios-sm">
          <p className="text-2xs font-semibold text-primary/70">Promo code applied</p>
          <p className="mt-0.5 text-sm font-semibold text-primary">{order.promoCode}</p>
        </section>
      )}

      {/* Order note (read-only) */}
      <section className="rounded-xl border border-border bg-card p-3 shadow-ios-sm">
        <p className="text-2xs font-semibold text-muted-foreground">Order note</p>
        <p className="mt-0.5 text-sm text-foreground/90 sm:text-sm">
          {order.orderNote ?? order.internalNote ?? 'No order note for this order.'}
        </p>
      </section>
        </div>
      </details>
    </div>
  )
}
