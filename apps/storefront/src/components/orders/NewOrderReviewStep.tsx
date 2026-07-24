/**
 * @file NewOrderReviewStep.tsx
 * @description Read-only review step of NewOrderSheet: shown after the edit
 * form validates, right before final "Confirm & create order". Surfaces the
 * business-critical summary (total, payment status, fulfillment) up top,
 * then groups the rest of the intake into Customer & order / Fulfillment /
 * Payment & extras cards — each with an "Edit" link that jumps back to the
 * edit step. Purely presentational: all values are precomputed by the
 * parent from its form state.
 */

import type { FC } from 'react'
import { ChevronRight, CreditCard, MapPin, Package2, UserRound } from 'lucide-react'
import { getDisplayPriceIdr } from '../../domain/catalogDomain'
import type { CatalogProduct } from '../../store/catalogStoreTypes'

/**
 * @description Subset of NewOrderSheet's form values needed to render the
 * review step. Kept as a narrow, explicit shape (rather than importing the
 * parent's full form-values type) so this component's contract stays
 * self-describing.
 */
export interface NewOrderReviewValues {
  customerName: string
  customerWhatsappNumber: string
  orderItemMode: 'catalog' | 'custom'
  orderItemCustomName: string
  orderItemCustomPrice: string
  fulfillmentType: '' | 'delivery' | 'pickup'
  deliveryDate: string
  deliveryTime: string
  deliveryAddress: string
  deliveryInstructions: string
  deliveryFee: string
  greetingMessage: string
  greetingCardName: string
  promoCode: string
  orderNote: string
  paymentStatus: 'unpaid' | 'partial' | 'paid'
}

export interface NewOrderReviewStepProps {
  values: NewOrderReviewValues
  /** Catalog product selected in catalog mode, if any (null in custom mode or no selection yet). */
  selectedCatalogProduct: CatalogProduct | null
  estimatedOrderTotalIdr: number
  voucherDiscountIdr: number
  depositValueForReview: number
  paymentStatusLabel: string
  paymentMethodLabel: string
  fulfillmentLabel: string
  /** Shared IDR formatter (Intl.NumberFormat('id-ID')) so figures match the rest of the sheet exactly. */
  formatter: Intl.NumberFormat
  /** Jumps back to the edit step, e.g. from any card's "Edit" link. */
  onEdit: () => void
}

export const NewOrderReviewStep: FC<NewOrderReviewStepProps> = ({
  values,
  selectedCatalogProduct,
  estimatedOrderTotalIdr,
  voucherDiscountIdr,
  depositValueForReview,
  paymentStatusLabel,
  paymentMethodLabel,
  fulfillmentLabel,
  formatter,
  onEdit,
}) => {
  const attentionNotes: string[] = []
  if (values.paymentStatus === 'unpaid') {
    attentionNotes.push('No payment has been recorded yet.')
  }
  if (values.paymentStatus === 'partial') {
    attentionNotes.push('A remaining balance will still be due after creation.')
  }
  if (values.orderItemMode === 'custom') {
    attentionNotes.push('This order uses a manually entered product and price.')
  }

  const extraRows: { label: string; value: string }[] = []
  if (values.greetingMessage.trim()) {
    extraRows.push({ label: 'Greeting message', value: values.greetingMessage })
  }
  if (values.greetingCardName.trim()) {
    extraRows.push({ label: 'Name on greeting card', value: values.greetingCardName })
  }
  if (values.promoCode.trim()) {
    extraRows.push({ label: 'Promo code', value: values.promoCode })
  }
  if (values.orderNote.trim()) {
    extraRows.push({ label: 'Order note', value: values.orderNote })
  }

  return (
    <section className="space-y-4 pb-2">
      <header className="space-y-1.5">
        <h3 className="text-base font-semibold leading-6 text-foreground">Review order</h3>
        <p className="text-sm text-muted-foreground">
          Confirm details before creating the order.
        </p>
      </header>

      {/* Business-critical summary: total, payment status, fulfillment */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-card px-4 py-4 text-foreground shadow-ios-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Estimated order value</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            Rp {formatter.format(estimatedOrderTotalIdr)}
          </p>
          {voucherDiscountIdr > 0 && (
            <p className="mt-1 text-xs font-medium text-success-foreground">
              Voucher -Rp {formatter.format(voucherDiscountIdr)}
            </p>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center rounded-full bg-card px-2.5 py-1 font-medium text-foreground ring-1 ring-border">
            {paymentStatusLabel}
          </span>
          <span className="inline-flex items-center rounded-full bg-card px-2.5 py-1 font-medium text-foreground ring-1 ring-border">
            {fulfillmentLabel}
          </span>
        </div>
      </div>

      {attentionNotes.length > 0 && (
        <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2">
          <p className="text-xs font-semibold text-foreground">Check before creating</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {attentionNotes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Customer + Order items — the two things that matter most, grouped
          in one card so the eye doesn't hop between six identical-looking
          boxes. */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-ios-sm ring-1 ring-black/[0.02]">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-surface-panel/60 px-4 py-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-foreground"><UserRound className="size-3.5 text-muted-foreground" />Customer & order</p>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Edit <ChevronRight className="size-3.5" />
          </button>
        </div>
        <div className="grid gap-3 px-4 py-4 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-surface-panel/70 p-3 ring-1 ring-border/50">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Customer</p>
            <p className="mt-1 font-semibold text-foreground">{values.customerName || '—'}</p>
            <p className="text-muted-foreground">
              {values.customerWhatsappNumber || 'No WhatsApp provided'}
            </p>
          </div>
          <div className="rounded-xl bg-surface-panel/70 p-3 ring-1 ring-border/50">
            <p className="inline-flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground"><Package2 className="size-3" />Order item</p>
            <div className="mt-1">
            {values.orderItemMode === 'catalog' && selectedCatalogProduct ? (
              <>
                <p className="font-semibold text-foreground">
                  {selectedCatalogProduct.name}
                </p>
                <p className="text-muted-foreground">
                  Rp {formatter.format(getDisplayPriceIdr(selectedCatalogProduct))}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-foreground">
                  {values.orderItemCustomName || 'Custom item'}
                </p>
                <p className="text-muted-foreground">
                  {values.orderItemCustomPrice
                    ? `Rp ${values.orderItemCustomPrice}`
                    : 'Price not set'}
                </p>
              </>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Fulfillment — only shows the fields that matter for the chosen
          type; delivery-only fields never render for pickup. */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-ios-sm ring-1 ring-black/[0.02]">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-surface-panel/60 px-4 py-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-foreground"><MapPin className="size-3.5 text-muted-foreground" />Fulfillment</p>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Edit <ChevronRight className="size-3.5" />
          </button>
        </div>
        <div className="space-y-1.5 px-4 py-4 text-sm text-foreground">
          <p className="font-semibold">{fulfillmentLabel}</p>
          {values.fulfillmentType === 'delivery' && (
            <>
              <p className="text-muted-foreground">
                {values.deliveryAddress || 'No address set.'}
              </p>
              {(values.deliveryDate || values.deliveryTime) && (
                <p className="text-muted-foreground">
                  {values.deliveryDate}
                  {values.deliveryDate && values.deliveryTime ? ' · ' : ''}
                  {values.deliveryTime}
                </p>
              )}
              {values.deliveryInstructions && (
                <p className="text-muted-foreground">{values.deliveryInstructions}</p>
              )}
              {values.deliveryFee && (
                <p className="text-muted-foreground">
                  Delivery fee: Rp {values.deliveryFee}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Extras — greeting card, promo, notes, and payment method all live
          here as a single lower-priority group; rows for anything left
          empty are skipped instead of printing placeholder copy like "No
          message." for every field. */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-ios-sm ring-1 ring-black/[0.02]">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-surface-panel/60 px-4 py-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-foreground"><CreditCard className="size-3.5 text-muted-foreground" />Payment & extras</p>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            Edit <ChevronRight className="size-3.5" />
          </button>
        </div>
        <div className="space-y-2.5 px-4 py-4 text-sm">
          <p className="text-foreground">
            <span className="font-semibold">{paymentMethodLabel}</span>
            {values.paymentStatus === 'partial' && depositValueForReview > 0 && (
              <span className="text-muted-foreground">
                {' '}
                · Deposit Rp {formatter.format(depositValueForReview)}
              </span>
            )}
          </p>
          {extraRows.length > 0 && (
            <div className="space-y-1 border-t border-border/50 pt-2">
              {extraRows.map((row) => (
                <p key={row.label}>
                  <span className="font-semibold text-foreground">{row.label}:</span>{' '}
                  <span className="text-muted-foreground">{row.value}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default NewOrderReviewStep
