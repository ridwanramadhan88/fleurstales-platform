/**
 * @file OrderChangeRequestModal.tsx
 * @description Modal where Admin fills in a required reason before submitting
 * an edit or cancellation request on a locked order.
 */

import type { FC } from 'react'
import { AppDialog } from '../ui/app-dialog'
import { ActionFooter } from '../ui/action-footer'

export interface OrderChangeRequestModalProps {
  mode: 'edit' | 'cancel' | null
  reason: string
  onReasonChange: (reason: string) => void
  onCancel: () => void
  onSubmit: () => void
}

export const OrderChangeRequestModal: FC<OrderChangeRequestModalProps> = ({
  mode,
  reason,
  onReasonChange,
  onCancel,
  onSubmit,
}) => {
  const open = Boolean(mode)

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
      title={mode === 'cancel' ? 'Request cancellation' : 'Request edit'}
      description={
        mode === 'cancel'
          ? 'This finished order is locked. Finance or Owner must approve the cancellation request before the order changes.'
          : 'This finished order is locked. Finance or Owner must approve the request before you can edit and save changes.'
      }
      contentClassName="max-w-sm"
    >
      <div className="space-y-1.5">
        <label htmlFor="order-change-request-reason" className="text-xs font-medium text-foreground/90">
          Reason (required)
        </label>
        <textarea
          id="order-change-request-reason"
          autoFocus
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          rows={3}
          placeholder="Explain why this order needs to change or be cancelled…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
        />
      </div>
      <ActionFooter>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full text-xs font-medium text-muted-foreground hover:bg-muted rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!reason.trim()}
          onClick={onSubmit}
          className="rounded-full bg-foreground text-xs font-semibold text-background shadow-ios-sm hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
        >
          Submit request
        </button>
      </ActionFooter>
    </AppDialog>
  )
}

export default OrderChangeRequestModal
