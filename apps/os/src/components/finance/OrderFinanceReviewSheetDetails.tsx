import type { FC } from 'react'
import { AlertTriangle, CheckCircle2, Clock, ImageIcon, MapPin, MessageCircle, Smartphone, Truck, User } from 'lucide-react'
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
  const difference = paidAmount - order.totalIdr
  const latestPayment = [...(order.paymentHistory ?? [])]
    .filter((event) => event.type === 'payment_received' || event.type === 'payment_status_adjusted')
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  const paymentMethod = latestPayment?.method ?? order.paymentMethod
  const paymentMismatch =
    (order.paymentStatus === 'paid' && paidAmount !== order.totalIdr) ||
    (order.paymentStatus === 'partial' && (paidAmount <= 0 || paidAmount >= order.totalIdr)) ||
    (order.paymentStatus === 'unpaid' && paidAmount > 0)
  const missingProof = paymentMethod === 'transfer' && !order.paymentProofUrl
  const paymentReady = !paymentMismatch && !missingProof
  const paymentTime = latestPayment?.occurredAt
    ? ' · ' + new Date(latestPayment.occurredAt).toLocaleString('id-ID')
    : ''
  const differenceLabel = difference === 0
    ? formatIdrCurrency(0) + ' ✓'
    : (difference > 0 ? '+' : '−') + formatIdrCurrency(Math.abs(difference))

  return (
    <div className="space-y-5">
      <section className={cardClass + ' space-y-4'}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={'flex size-10 shrink-0 items-center justify-center rounded-full ' + (paymentReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
              {paymentReady ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Finance decision</p>
              <p className={'mt-1 text-base font-semibold ' + (paymentReady ? 'text-success' : 'text-warning')}>
                {paymentReady ? 'Payment matches' : 'Payment needs attention'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {paymentMethod === 'transfer' ? 'Bank transfer' : paymentMethod === 'cash' ? 'Cash' : 'Payment method not recorded'}
                {paymentTime}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-surface-panel px-3 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border/60">
            {order.orderNumber}
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-panel p-3">
            <p className="text-xs font-medium text-muted-foreground">Expected</p>
            <p className="mt-1 text-base font-semibold text-foreground">{formatIdrCurrency(order.totalIdr)}</p>
          </div>
          <div className="rounded-xl bg-surface-panel p-3">
            <p className="text-xs font-medium text-muted-foreground">Recorded paid</p>
            <p className="mt-1 text-base font-semibold text-foreground">{formatIdrCurrency(paidAmount)}</p>
          </div>
          <div className={'rounded-xl p-3 ' + (paymentMismatch ? 'bg-warning/10' : 'bg-success/10')}>
            <p className={'text-xs font-medium ' + (paymentMismatch ? 'text-warning' : 'text-success')}>Difference</p>
            <p className={'mt-1 text-base font-semibold ' + (paymentMismatch ? 'text-warning' : 'text-success')}>
              {differenceLabel}
            </p>
          </div>
        </div>

        {paymentMismatch ? (
          <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Payment amount does not match</p>
              <p className="mt-0.5 text-xs text-warning/90">
                Expected {formatIdrCurrency(order.totalIdr)} · recorded {formatIdrCurrency(paidAmount)} · balance {formatIdrCurrency(remainingBalance)}.
              </p>
            </div>
          </div>
        ) : null}

        {paymentMethod === 'transfer' ? (
          order.paymentProofUrl ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Bukti transfer</p>
              <OrderPaymentProofFinanceCard paymentProofPath={order.paymentProofUrl} />
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Bukti transfer tidak ditemukan</p>
                <p className="mt-0.5 text-xs text-warning/90">This transfer should not be reconciled until the expected payment evidence is available.</p>
              </div>
            </div>
          )
        ) : null}

        {canVerify ? (
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
        ) : null}

        {(latestPayment?.reference || latestPayment?.note) ? (
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            {latestPayment.reference ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Transaction reference</p>
                <p className="mt-1 break-all font-medium text-foreground">{latestPayment.reference}</p>
              </div>
            ) : null}
            {latestPayment.note ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Payment note</p>
                <p className="mt-1 text-foreground/90">{latestPayment.note}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <details className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
        <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-foreground marker:hidden">
          <span className="flex items-center justify-between gap-3">
            Order details
            <span className="text-2xs font-medium text-muted-foreground group-open:hidden">Show</span>
            <span className="hidden text-2xs font-medium text-muted-foreground group-open:inline">Hide</span>
          </span>
        </summary>

        <div className="space-y-5 border-t border-border/60 p-4">
          <OrderFinanceReviewProductSummary
            order={order}
            productDisplay={productDisplay}
            itemDisplays={itemDisplays}
          />

          {order.finishPhotoUrl ? (
            <section className={cardClass + ' space-y-3'}>
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
                <img src={order.finishPhotoUrl} alt={'Finished product for ' + order.orderNumber} className="max-h-[28rem] w-full object-contain" />
              </a>
            </section>
          ) : null}

          <section className={cardClass + ' space-y-4'}>
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

          {order.promoCode ? (
            <section className="rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/20">
              <p className="text-xs font-semibold text-primary/70">Promo code applied</p>
              <p className="mt-1 text-sm font-semibold text-primary">{order.promoCode}</p>
            </section>
          ) : null}

          <section className={cardClass}>
            <p className="text-xs font-semibold text-muted-foreground">Order note</p>
            <p className="mt-1 text-sm text-foreground/90">{order.orderNote ?? order.internalNote ?? 'No order note for this order.'}</p>
          </section>
        </div>
      </details>
    </div>
  )
}
