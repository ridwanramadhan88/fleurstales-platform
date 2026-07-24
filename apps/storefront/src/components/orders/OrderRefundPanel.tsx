import type { FC } from 'react'
import { CheckCircle2, ShieldAlert } from 'lucide-react'
import type { OrderDetailsViewModel } from './OrderDetailsController'

interface OrderRefundPanelProps {
  viewModel: OrderDetailsViewModel
}

const formatTimestamp = (value?: string) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export const OrderRefundPanel: FC<OrderRefundPanelProps> = ({ viewModel }) => {
  const {
    order,
    formatter,
    canManageRefund,
    canCompleteRefund,
    canCancelRefund,
    onOpenCompleteRefund,
    onOpenCancelRefund,
  } = viewModel

  if (!canManageRefund || !['paid', 'refund_pending', 'refunded'].includes(order.paymentStatus)) {
    return null
  }

  // Paid orders expose the existing initiate-refund action from the
  // header overflow menu so the primary order content stays focused.
  if (order.paymentStatus === 'paid') return null

  const isPending = order.paymentStatus === 'refund_pending'

  return (
    <section className={`rounded-xl border px-3.5 py-3 shadow-none ${isPending ? 'border-info/30 bg-info/5' : 'border-border bg-surface-panel'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isPending ? 'bg-info/10 text-info' : 'bg-success/10 text-success'}`}>
            {isPending ? <ShieldAlert className="size-4" /> : <CheckCircle2 className="size-4" />}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-5 text-foreground">
              {isPending ? 'Refund pending' : 'Refund completed'}
            </h3>
            <dl className="mt-3 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Amount</dt><dd className="font-medium text-foreground">{formatter.format(order.refundAmountIdr ?? 0)}</dd></div>
              <div><dt className="text-muted-foreground">Reason</dt><dd className="font-medium text-foreground">{order.refundReason ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">Initiated by</dt><dd className="font-medium text-foreground">{order.refundInitiatedBy ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">Initiated at</dt><dd className="font-medium text-foreground">{formatTimestamp(order.refundInitiatedAt)}</dd></div>
              {!isPending && <div><dt className="text-muted-foreground">Completed by</dt><dd className="font-medium text-foreground">{order.refundCompletedBy ?? '—'}</dd></div>}
              {!isPending && <div><dt className="text-muted-foreground">Completed at</dt><dd className="font-medium text-foreground">{formatTimestamp(order.refundCompletedAt)}</dd></div>}
            </dl>
          </div>
        </div>
        {isPending && (canCompleteRefund || canCancelRefund) && <div className="flex flex-wrap gap-2 sm:flex-nowrap">{canCancelRefund && <button type="button" onClick={onOpenCancelRefund} className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-border text-xs font-semibold rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Cancel Refund</button>}{canCompleteRefund && <button type="button" onClick={onOpenCompleteRefund} className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-secondary text-xs font-semibold text-secondary-foreground shadow-ios-sm rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Complete Refund</button>}</div>}
      </div>
    </section>
  )
}
