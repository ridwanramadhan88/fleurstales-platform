import type { FC } from 'react'
import { AlertTriangle, CheckCircle2, Clock, CreditCard, ImageIcon, MapPin, MessageCircle, Smartphone, Truck, User } from 'lucide-react'
import { SOURCE_LABELS } from '../orders/orderTableLabels'
import { getActualPickupLabel, getDisplayScheduleLabel, getRequestedPickupLabel } from '../orders/orderTableFormatters'
import { formatIdrCurrency } from '../../lib/formatters'
import type { OrderFinanceReviewSheetViewModel } from './OrderFinanceReviewSheetController'
import { OrderFinanceReviewProductSummary } from './OrderFinanceReviewProductSummary'
import { OrderPaymentProofFinanceCard } from '../orders/OrderPaymentProofFinanceCard'
import { getOrderFinancePresentation } from '../orders/orderUxPresentation'

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
  const finance = getOrderFinancePresentation(order)
  const latestPayment = [...(order.paymentHistory ?? [])]
    .filter((event) => event.type === 'payment_received' || event.type === 'payment_status_adjusted')
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  const paymentMethod = latestPayment?.method ?? order.paymentMethod
  const absoluteDifference = Math.abs(finance.differenceIdr)

  return (
    <div className="space-y-5">
      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CreditCard className="size-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Payment decision</p>
              <p className="text-base font-semibold leading-5 text-foreground">
                {paymentMethod === 'transfer' ? 'Bank transfer' : paymentMethod === 'cash' ? 'Cash' : 'Method not recorded'}
              </p>
            </div>
          </div>
          {finance.paymentMismatch ? (
            <span className="rounded-full bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning">
              Difference {formatIdrCurrency(absoluteDifference)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1.5 text-xs font-semibold text-success">
              <CheckCircle2 className="size-3.5" /> Payment matches
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-surface-panel p-3">
            <p className="text-xs font-medium text-muted-foreground">Expected</p>
            <p className="mt-1 text-base font-semibold text-foreground">{formatIdrCurrency(order.totalIdr)}</p>
          </div>
          <div className="rounded-xl bg-surface-panel p-3">
            <p className="text-xs font-medium text-muted-foreground">Recorded paid</p>
            <p className="mt-1 text-base font-semibold text-foreground">{formatIdrCurrency(finance.paidAmountIdr)}</p>
          </div>
          <div className={'rounded-xl p-3 ' + (finance.paymentMismatch ? 'bg-warning/10' : 'bg-success/8')}>
            <p className="text-xs font-medium text-muted-foreground">Difference</p>
            <p className={'mt-1 text-base font-semibold ' + (finance.paymentMismatch ? 'text-warning' : 'text-success')}>
              {finance.paymentMismatch ? formatIdrCurrency(absoluteDifference) : formatIdrCurrency(0)}
            </p>
          </div>
        </div>

        {(latestPayment?.occurredAt || latestPayment?.reference || latestPayment?.note) ? (
          <div className="mt-4 grid gap-3 border-t border-border/50 pt-4 text-sm sm:grid-cols-2">
            {latestPayment?.occurredAt ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Payment time</p>
                <p className="mt-1 font-medium text-foreground">
                  {new Date(latestPayment.occurredAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
            ) : null}
            {latestPayment?.reference ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Transaction reference</p>
                <p className="mt-1 break-all font-medium text-foreground">{latestPayment.reference}</p>
              </div>
            ) : null}
            {latestPayment?.note ? (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Payment note</p>
                <p className="mt-1 text-foreground/90">{latestPayment.note}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {finance.paymentMismatch ? (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Payment amount needs review</p>
              <p className="mt-0.5 text-xs text-warning/90">Expected and recorded amounts do not match. Review the evidence before reconciling.</p>
            </div>
          </div>
        ) : null}
      </section>

      {paymentMethod === 'transfer' ? (
        <section className={cardClass}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Bukti transfer</p>
              <p className="mt-0.5 text-sm font-medium text-foreground">Primary payment evidence</p>
            </div>
          </div>
          {order.paymentProofUrl ? (
            <OrderPaymentProofFinanceCard paymentProofPath={order.paymentProofUrl} />
          ) : (
            <div className="flex items-start gap-2 rounded-xl bg-warning/10 px-3 py-3 text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Bukti transfer tidak ditemukan</p>
                <p className="mt-0.5 text-xs text-warning/90">This transfer cannot be confidently reconciled until the expected private payment evidence is available.</p>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {canVerify ? (
        <label className="block rounded-2xl bg-surface-card p-4 ring-1 ring-border/60">
          <span className="text-xs font-semibold text-muted-foreground">Kode Rekonsiliasi</span>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Keep the Finance reference beside the payment evidence so the decision can be completed without searching through order details.</p>
          <div className="mt-3 flex gap-2">
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
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-sm font-medium uppercase outline-none transition focus:border-foreground/35 focus:ring-2 focus:ring-foreground/10"
            />
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { void onSaveFinanceReference() }}
              disabled={financeReferenceBusy || !financeReferenceDirty}
              className="h-11 rounded-full bg-foreground px-4 text-xs font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {financeReferenceBusy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </label>
      ) : null}

      <details className="group rounded-2xl bg-surface-card ring-1 ring-border/60">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-foreground">Order details</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Operational reference only</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground group-open:hidden">Show</span>
          <span className="hidden text-xs font-semibold text-muted-foreground group-open:inline">Hide</span>
        </summary>

        <div className="space-y-5 border-t border-border/50 p-4">
          <OrderFinanceReviewProductSummary
            order={order}
            productDisplay={productDisplay}
            itemDisplays={itemDisplays}
          />

          {order.finishPhotoUrl ? (
            <section className={cardClass}>
              <div className="flex items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <ImageIcon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground">Finished product photo</p>
                  <a href={order.finishPhotoUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">Open photo</a>
                </div>
              </div>
            </section>
          ) : null}

          <section className={cardClass}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <User className="size-4 shrink-0 text-muted-foreground" />
                <div><p className="text-xs text-muted-foreground">Florist</p><p className="text-sm font-medium">{order.florist ?? 'Not assigned'}</p></div>
              </div>
              <div className="flex items-center gap-3">
                {order.source === 'whatsapp' ? <MessageCircle className="size-4 shrink-0 text-muted-foreground" /> : <Smartphone className="size-4 shrink-0 text-muted-foreground" />}
                <div><p className="text-xs text-muted-foreground">Source</p><p className="text-sm font-medium">{SOURCE_LABELS[order.source]}</p></div>
              </div>
              <div className="flex items-center gap-3">
                {order.fulfillment === 'delivery' ? <Truck className="size-4 shrink-0 text-muted-foreground" /> : <MapPin className="size-4 shrink-0 text-muted-foreground" />}
                <div><p className="text-xs text-muted-foreground">Fulfillment</p><p className="text-sm font-medium">{order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}</p></div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">{order.fulfillment === 'pickup' ? 'Pickup' : 'Delivery schedule'}</p>
                  <p className="text-sm font-medium">
                    {order.fulfillment === 'pickup'
                      ? order.status === 'picked_up'
                        ? getActualPickupLabel(order) ?? getRequestedPickupLabel(order) ?? '—'
                        : getRequestedPickupLabel(order) ?? '—'
                      : getDisplayScheduleLabel(order) ?? '—'}
                  </p>
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
