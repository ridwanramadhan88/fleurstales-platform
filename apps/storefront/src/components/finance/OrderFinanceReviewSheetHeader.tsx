import type { FC } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { StatusChip } from '../ui/chip'
import { PAYMENT_CHIP_TONE, PAYMENT_STATUS_LABELS, URGENCY_CHIP } from '../orders/orderTableLabels'
import { getDisplayScheduleLabel, isPaymentOverdue } from '../orders/orderTableFormatters'
import type { OrderFinanceReviewSheetViewModel } from './OrderFinanceReviewSheetController'

/**
 * @description Critical summary header plus the Finance verification banner
 * (Verified / Rejected / Marked for review / Awaiting verification) shown at
 * the top of the read-only Finance review sheet. Split out of
 * `OrderFinanceReviewSheet.tsx`.
 */

type OrderFinanceReviewSheetHeaderProps = Pick<
  OrderFinanceReviewSheetViewModel,
  'order' | 'onClose' | 'productName' | 'urgency' | 'wasRejected' | 'isMarkedForReview'
>

export const OrderFinanceReviewSheetHeader: FC<OrderFinanceReviewSheetHeaderProps> = ({
  order,
  onClose,
  productName,
  urgency,
  wasRejected,
  isMarkedForReview,
}) => {
  return (
    <>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-1.5 text-2xs font-semibold text-muted-foreground">
            Order · view only
          </p>
          <h2 className="text-lg font-semibold leading-6 text-foreground">
            {order.customerName}
          </h2>
          <p className="text-sm font-semibold text-foreground sm:text-base">{productName}</p>
          <p className="text-2xs text-muted-foreground">{order.orderNumber}</p>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {order.branch} · {order.createdAtLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusChip
            tone={URGENCY_CHIP[urgency].tone}
            className="hidden shrink-0 whitespace-nowrap sm:inline-flex"
          >
            {getDisplayScheduleLabel(order) ?? URGENCY_CHIP[urgency].label}
          </StatusChip>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      {/* Finance verification banner: what Finance decided (or hasn't yet)
          on this specific order, distinct from the fulfillment stepper
          below. */}
      <div
        className={`mb-3 flex items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 ring-1 ${
          wasRejected
            ? 'bg-destructive/5 ring-destructive/30'
            : order.financeVerified
              ? 'bg-success/5 ring-success/20'
              : isMarkedForReview
                ? 'bg-warning/5 ring-warning/30'
                : 'bg-info/5 ring-info/20'
        }`}
      >
        <span
          className={`inline-flex items-center gap-1.5 text-sm font-medium ${
            wasRejected
              ? 'text-destructive'
              : order.financeVerified
                ? 'text-success'
                : isMarkedForReview
                  ? 'text-warning'
                  : 'text-info'
          }`}
        >
          <ShieldCheck className="size-3.5 shrink-0" />
          {wasRejected
            ? 'Rejected by Finance'
            : order.financeVerified
              ? 'Verified'
              : isMarkedForReview
                ? 'Marked for review'
                : 'Awaiting Finance verification'}
          {order.financeVerificationActor ? ` · ${order.financeVerificationActor}` : ''}
        </span>
        <StatusChip
          tone={
            order.paymentStatus === 'unpaid' && !isPaymentOverdue(order)
              ? 'neutral'
              : PAYMENT_CHIP_TONE[order.paymentStatus]
          }
        >
          {PAYMENT_STATUS_LABELS[order.paymentStatus]}
        </StatusChip>
      </div>
      {order.financeVerificationNote && (
        <p className="-mt-2 mb-3 px-1 text-xs text-muted-foreground">
          Note: {order.financeVerificationNote}
        </p>
      )}
    </>
  )
}
