import type { FC } from 'react'
import { X } from 'lucide-react'
import { StatusChip } from '../ui/chip'
import { URGENCY_CHIP } from '../orders/orderTableLabels'
import { formatOrderCreatedAtLabel, getDisplayScheduleLabel } from '../orders/orderTableFormatters'
import type { OrderFinanceReviewSheetViewModel } from './OrderFinanceReviewSheetController'

type OrderFinanceReviewSheetHeaderProps = Pick<
  OrderFinanceReviewSheetViewModel,
  'order' | 'onClose' | 'urgency'
>

export const OrderFinanceReviewSheetHeader: FC<OrderFinanceReviewSheetHeaderProps> = ({
  order,
  onClose,
  urgency,
}) => (
  <header className="-mx-5 mb-0 flex flex-wrap items-start justify-between gap-3 border-b border-border/80 bg-card px-5 pb-3 shadow-[0_8px_18px_-16px_rgba(0,0,0,0.5)] sm:-mx-6 sm:px-6 sm:pb-3.5">
    <div className="min-w-0 flex-1 space-y-1">
      <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Verifikasi Keuangan
      </p>
      <h2 className="text-lg font-semibold leading-6 text-foreground">
        {order.customerName}
      </h2>
      <p className="text-xs font-medium text-foreground/80">{order.orderNumber}</p>
      <p className="text-xs text-muted-foreground sm:text-sm">
        {order.branch} · {formatOrderCreatedAtLabel(order.createdAtLabel)}
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
)

export default OrderFinanceReviewSheetHeader
