import type { FC } from 'react'
import { AlertTriangle, Clock, CreditCard, ImageIcon, MapPin, MessageCircle, Smartphone, Truck, User } from 'lucide-react'
import { SOURCE_LABELS } from '../orders/orderTableLabels'
import { getActualPickupLabel, getDisplayScheduleLabel, getRequestedPickupLabel } from '../orders/orderTableFormatters'
import { formatIdrCurrency } from '../../lib/formatters'
import type { OrderFinanceReviewSheetViewModel } from './OrderFinanceReviewSheetController'
import { OrderFinanceReviewProductSummary } from './OrderFinanceReviewProductSummary'
import { OrderPaymentProofFinanceCard } from '../orders/OrderPaymentProofFinanceCard'

type OrderFinanceReviewSheetDetailsProps = Pick<
  OrderFinanceReviewSheetViewModel,
  | 'order'
  | 'productDisplay'
  | 'itemDisplays'
  | 'canVerify'
  | 'financeReferenceDraft'
  | 'financeReferenceBusy'
  | 'financeReferenceDirty'
  | 'onFinanceReferenceChange'
  | 'onSaveFinanceReference'
>

const cardClass = 'rounded-2xl bg-surface-card p-4 ring-1 ring-border/60'

export const OrderFinanceReviewSheetDetails: FC<OrderFinanceReviewSheetDetailsProps> = ({
  order,
  productDisplay,
  itemDisplays,
  canVerify,
  financeReferenceDraft,
  financeReferenceBusy,
  financeReferenceDirty,
  onFinanceReferenceChange,
  onSaveFinanceReference,
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
    <div className="space-y-8">
      <section className={`${cardClass} space-y-4`}>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CreditCard className="size-4" />
          </span>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Payment</p>
            <p className="text-base font-semibold leading-5 text-foreground">
              {paymentMethod === 'transfer' ? 'Bank transfer' : paymentMethod === 'cash' ? 'Cash' : 'Method not recorded'}
            </p>
          </div>
        </div>

        {paymentMethod === 'transfer' ? (
          order.paymentProofUrl ? (
            <OrderPaymentProofFinanceCard paymentProofPath={order.paymentProofUrl} />
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Bukti transfer tidak ditemukan</p>
                <p className="mt-0.5 text-xs text-warning/90">This transfer was recorded without the expected private payment proof.</p>
              </div>
            </div>
          )
        ) : null}

        <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-panel p-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Order total</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatIdrCurrency(order.totalIdr)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Paid</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatIdrCurrency(paidAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Balance</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatIdrCurrency(remainingBalance)}</p>
          </div>
        </div>

        {canVerify && (
          <label className="block rounded-xl bg-background p-3 ring-1 ring-border/70">
            <span className="text-xs font-semibold text-muted-foreground">Kode Rekonsiliasi</span>
            <div className="mt-2 flex gap-2">
              <input
                value={financeReferenceDraft}
                onChange={(event) => onFinanceReferenceChange(event.target.value)}
                onBlur={() => { if (financeReferenceDirty) void onSaveFinanceReference() }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  if (financeReferenceDirty) void onSaveFinanceReference()
                }}
                maxLength={64}
                placeholder="TRX-2026-001"
                autoComplete="off"
                className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm font-medium uppercase outline-none transition focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10"
              />
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { void onSaveFinanceReference() }}
                disabled={financeReferenceBusy || !financeReferenceDirty}
                className="h-10 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {financeReferenceBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </label>
        )}

        {(latestPayment?.reference || latestPayment?.note) && (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {latestPayment.reference && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Transaction reference</p>
                <p className="mt-1 break-all font-medium text-foreground">{latestPayment.reference}</p>
              </div>
            )}
            {latestPayment.note && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Payment note</p>
                <p className="mt-1 text-foreground/90">{latestPayment.note}</p>
              </div>
            )}
          </div>
        )}

        {paymentMismatch && (
          <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Payment status and amount do not match</p>
              <p className="mt-0.5 text-xs text-warning/90">Review the paid amount and payment history before reconciling.</p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Order details</p>
          <p className="mt-1 text-sm text-muted-foreground">Same order information used by Operations, kept read-only for Finance.</p>
        </div>

        <OrderFinanceReviewProductSummary
          order={order}
          productDisplay={productDisplay}
          itemDisplays={itemDisplays}
        />

        {order.finishPhotoUrl && (
          <section className={`${cardClass} space-y-3`}>
            <div className="flex items-center gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                <ImageIcon className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Finished product photo</p>
                <p className="text-sm font-medium text-foreground">Customer-ready result</p>
              </div>
            </div>
            <a href={order.finishPhotoUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-muted/20 ring-1 ring-border/60">
              <img src={order.finishPhotoUrl} alt={`Finished product for ${order.orderNumber}`} className="max-h-[28rem] w-full object-contain" />
            </a>
          </section>
        )}

        <section className={`${cardClass} space-y-4`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">Florist</p>
                <p className="truncate text-sm font-medium text-foreground/90">
                  {order.florist ?? <span className="font-normal text-muted-foreground">Not assigned</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                {order.source === 'whatsapp' ? <MessageCircle className="size-4" /> : <Smartphone className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">Source</p>
                <p className="truncate text-sm font-medium text-foreground/90">{SOURCE_LABELS[order.source]}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                {order.fulfillment === 'delivery' ? <Truck className="size-4" /> : <MapPin className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">Fulfillment</p>
                <p className="truncate text-sm font-medium text-foreground/90">{order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Clock className="size-4" />
              </span>
              <div className="min-w-0 space-y-2">
                {order.fulfillment === 'pickup' ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">Requested pickup</p>
                      <p className="text-sm font-medium text-foreground/90">{getRequestedPickupLabel(order) ?? '—'}</p>
                    </div>
                    {order.status === 'picked_up' ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Actual pickup</p>
                        <p className="text-sm font-medium text-foreground/90">{getActualPickupLabel(order) ?? '—'}</p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">Delivery schedule</p>
                    <p className="text-sm font-medium text-foreground/90">{getDisplayScheduleLabel(order) ?? '—'}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={cardClass}>
          <p className="text-xs font-semibold text-muted-foreground">Greeting card message</p>
          <p className="mt-1 text-sm text-foreground/90">{order.greetingMessage ?? order.giftMessage ?? 'No greeting message for this order.'}</p>
        </section>

        {order.promoCode && (
          <section className="rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/20">
            <p className="text-xs font-semibold text-primary/70">Promo code applied</p>
            <p className="mt-1 text-sm font-semibold text-primary">{order.promoCode}</p>
          </section>
        )}

        <section className={cardClass}>
          <p className="text-xs font-semibold text-muted-foreground">Order note</p>
          <p className="mt-1 text-sm text-foreground/90">{order.orderNote ?? order.internalNote ?? 'No order note for this order.'}</p>
        </section>
      </section>
    </div>
  )
}
