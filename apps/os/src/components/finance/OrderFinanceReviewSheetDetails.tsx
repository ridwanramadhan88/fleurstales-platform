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
    <div className="space-y-3 sm:col-span-3">
      <section className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-ios-sm">
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

        {paymentMethod === 'transfer' ? (
          order.paymentProofUrl ? (
            <OrderPaymentProofFinanceCard paymentProofPath={order.paymentProofUrl} />
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-2.5 py-2 text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold">Bukti transfer is missing</p>
                <p className="mt-0.5 text-2xs text-warning/90">This transfer was recorded without the expected private payment proof.</p>
              </div>
            </div>
          )
        ) : null}

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

        {canVerify && (
          <label className="block rounded-lg border border-border/70 bg-background p-2.5">
            <span className="text-2xs font-semibold text-muted-foreground">Kode Rekonsiliasi</span>
            <div className="mt-1.5 flex gap-2">
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
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-medium uppercase outline-none transition focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10"
              />
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { void onSaveFinanceReference() }}
                disabled={financeReferenceBusy || !financeReferenceDirty}
                className="h-10 rounded-lg bg-foreground px-4 text-xs font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {financeReferenceBusy ? 'Saving…' : 'Save'}
              </button>
            </div>
            <span className="mt-1.5 block text-2xs text-muted-foreground">Saved only on blur, Enter, or Save — not on every keystroke.</span>
          </label>
        )}

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
        <summary className="cursor-pointer text-sm font-semibold h-9 rounded-full px-3.5 gap-1.5 whitespace-nowrap">Order details & finished product</summary>
        <div className="mt-3 space-y-3">
          <OrderFinanceReviewProductSummary
            order={order}
            productDisplay={productDisplay}
            itemDisplays={itemDisplays}
          />

          {order.finishPhotoUrl && (
            <section className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-ios-sm">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <ImageIcon className="size-3.5" />
                </span>
                <div>
                  <p className="text-2xs font-semibold text-muted-foreground">Finished product photo</p>
                  <p className="text-sm font-medium text-foreground">Customer-ready result</p>
                </div>
              </div>
              <a href={order.finishPhotoUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border bg-muted/20">
                <img src={order.finishPhotoUrl} alt={`Finished product for ${order.orderNumber}`} className="max-h-[28rem] w-full object-contain" />
              </a>
            </section>
          )}

          <section className="space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-ios-sm">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <User className="size-3.5" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="text-2xs font-semibold text-muted-foreground">Florist</p>
                <p className="truncate text-sm font-medium text-foreground/90">
                  {order.florist ?? <span className="font-normal text-muted-foreground">Not assigned</span>}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-ios-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {order.source === 'whatsapp' ? <MessageCircle className="size-3.5" /> : <Smartphone className="size-3.5" />}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-2xs font-semibold text-muted-foreground">Source</p>
                  <p className="truncate text-sm font-medium text-foreground/90">{SOURCE_LABELS[order.source]}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {order.fulfillment === 'delivery' ? <Truck className="size-3.5" /> : <MapPin className="size-3.5" />}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-2xs font-semibold text-muted-foreground">Fulfillment</p>
                  <p className="truncate text-sm font-medium text-foreground/90">{order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</p>
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

          <section className="rounded-xl border border-border bg-card p-3 shadow-ios-sm">
            <p className="text-2xs font-semibold text-muted-foreground">Greeting card message</p>
            <p className="mt-0.5 text-sm text-foreground/90 sm:text-sm">{order.greetingMessage ?? order.giftMessage ?? 'No greeting message for this order.'}</p>
          </section>

          {order.promoCode && (
            <section className="rounded-xl border border-primary/20 bg-primary/10 p-3 shadow-ios-sm">
              <p className="text-2xs font-semibold text-primary/70">Promo code applied</p>
              <p className="mt-0.5 text-sm font-semibold text-primary">{order.promoCode}</p>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-3 shadow-ios-sm">
            <p className="text-2xs font-semibold text-muted-foreground">Order note</p>
            <p className="mt-0.5 text-sm text-foreground/90 sm:text-sm">{order.orderNote ?? order.internalNote ?? 'No order note for this order.'}</p>
          </section>
        </div>
      </details>
    </div>
  )
}
