/**
 * @file OrderChangeRequestBanner.tsx
 * @description Pending change-request banner shown at the top of
 * OrderDetailsPanel's body when the order has an unresolved Admin-submitted
 * edit/cancellation request:
 * - To Finance/Owner (canResolveRequest): the reason plus inline
 *   Approve/Reject actions, with Reject expanding into an optional-note
 *   step before confirming.
 * - To everyone else (e.g. the Admin who submitted it): a plain read-only
 *   notice that the request is awaiting review.
 * Renders nothing if there's no pending request on the order.
 */

import type { FC } from 'react'
import { useState } from 'react'
import type { OrderChangeRequest } from '../../types/orders'

export interface OrderChangeRequestBannerProps {
  /** The order's pending change request, if any. */
  request: OrderChangeRequest | undefined
  /** Whether the current user can approve/reject this request (Finance/Owner). */
  canResolveRequest: boolean
  /** Approves the pending request (applies the edit, or cancels the order). */
  onApprove: () => void
  /** Rejects the pending request, with an optional note. Leaves the order untouched. */
  onReject: (note?: string) => void
}

export const OrderChangeRequestBanner: FC<OrderChangeRequestBannerProps> = ({
  request,
  canResolveRequest,
  onApprove,
  onReject,
}) => {
  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectionNote, setRejectionNote] = useState('')

  if (!request) return null

  if (!canResolveRequest) {
    return (
      <div className="mb-3 rounded-lg bg-surface-panel px-3.5 py-2.5 text-xs text-muted-foreground ring-1 ring-border/60">
        {request.type === 'cancel' ? 'Cancellation' : 'Edit'} request submitted
        — awaiting Finance/Owner review.
      </div>
    )
  }

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            {request.type === 'cancel' ? 'Cancellation request' : 'Edit request'}{' '}
            from {request.requestedBy}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reason: {request.reason}
          </p>
        </div>
      </div>
      {isRejecting ? (
        <div className="space-y-1.5">
          <input
            type="text"
            value={rejectionNote}
            onChange={(event) => setRejectionNote(event.target.value)}
            placeholder="Optional note for rejecting this request"
            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsRejecting(false)
                setRejectionNote('')
              }}
              className="cursor-pointer h-11 rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                onReject(rejectionNote.trim() || undefined)
                setIsRejecting(false)
                setRejectionNote('')
              }}
              className="cursor-pointer h-11 rounded-full bg-destructive px-[18px] text-sm font-medium text-white shadow-ios-sm hover:bg-destructive/90"
            >
              Confirm reject
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setIsRejecting(true)}
            className="cursor-pointer h-11 rounded-full border border-destructive/30 bg-destructive/5 px-[18px] text-sm font-medium text-destructive shadow-ios-sm hover:bg-destructive/10"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="cursor-pointer rounded-full bg-success text-xs font-medium text-white shadow-ios-sm hover:bg-success/90 rounded-full px-[18px] whitespace-nowrap h-11 rounded-full px-[18px] gap-2 whitespace-nowrap"
          >
            Approve
          </button>
        </div>
      )}
    </div>
  )
}

export default OrderChangeRequestBanner
