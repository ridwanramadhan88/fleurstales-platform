import type { FC } from 'react'
import type { OrderTableRow } from '../../types/orders'
import type { RefundDialogMode } from './useOrderDetailsRefund'
import { AppDialog } from '../ui/app-dialog'
import { ActionFooter } from '../ui/action-footer'

interface OrderRefundDialogProps {
  mode: RefundDialogMode
  order: OrderTableRow
  formatter: Intl.NumberFormat
  reason: string
  onReasonChange: (value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export const OrderRefundDialog: FC<OrderRefundDialogProps> = ({
  mode,
  order,
  formatter,
  reason,
  onReasonChange,
  onCancel,
  onConfirm,
}) => {
  const initiating = mode === 'initiate'
  const cancelling = mode === 'cancel'
  const amount = initiating
    ? order.paidAmountIdr ?? order.totalIdr
    : order.refundAmountIdr ?? 0

  return (
    <AppDialog
      open={Boolean(mode)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
      title={initiating ? 'Initiate full refund?' : cancelling ? 'Cancel this Refund?' : 'Complete this refund?'}
      description={
        initiating
          ? `This places ${formatter.format(amount)} into refund pending. No money is marked returned until Finance completes it.`
          : cancelling ? `This stops the pending Refund and returns the payment status to Paid.` : `Confirm that ${formatter.format(amount)} has been returned. This marks the refund completed and sets the paid amount to zero.`
      }
      contentClassName="max-w-sm"
    >
      {initiating || cancelling ? (
        <div className="space-y-1.5">
          <label htmlFor="refund-reason" className="text-xs font-medium text-foreground">{cancelling ? 'Cancellation reason' : 'Refund reason'}</label>
          <textarea
            id="refund-reason"
            autoFocus
            rows={4}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder={cancelling ? 'Why is this Refund cancelled?' : 'Example: duplicate payment, order cancelled after payment…'}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
          />
        </div>
      ) : (
        <div className="rounded-xl bg-surface-panel p-3 text-xs">
          <p className="text-muted-foreground">Recorded reason</p>
          <p className="mt-1 font-medium text-foreground">{order.refundReason}</p>
        </div>
      )}

      <ActionFooter>
        <button type="button" onClick={onCancel} className="rounded-full text-xs font-medium text-muted-foreground hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap">Cancel</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={(initiating || cancelling) && !reason.trim()}
          className="rounded-full bg-foreground text-xs font-semibold text-background shadow-ios-sm hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
        >
          {initiating ? 'Initiate refund' : cancelling ? 'Cancel Refund' : 'Complete Refund'}
        </button>
      </ActionFooter>
    </AppDialog>
  )
}
