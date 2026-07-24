/**
 * @file ChangeRequestList.tsx
 * @description "Change requests awaiting review" section of
 * OrderTransactionVerificationQueue — Admin's edit/cancellation requests on
 * locked (finished) orders, reviewed here by Finance/Owner. Surfaced above
 * the main order list since these are time-sensitive (Admin is blocked on
 * the order until Finance/Owner acts).
 *
 * Approving a cancellation request voids the order directly. Approving an
 * edit request applies no changes itself — it unlocks the order so
 * Admin/Owner can make the actual edit through the normal edit form
 * afterward. Rejecting a request leaves the order untouched.
 *
 * Owns its own local state for the inline "reject with optional note" flow,
 * kept separate from the parent's per-order verification-action state so
 * the two flows never collide.
 */

import type { FC } from 'react'
import { useState } from 'react'
import type { OrderTableRow } from '../../types/orders'

/**
 * @description Formats a number as compact Rupiah currency for display.
 */
const formatIdr = (value: number): string => `Rp ${value.toLocaleString('id-ID')}`

export interface ChangeRequestListProps {
  /** Orders that currently have a pending change request. */
  orders: OrderTableRow[]
  /** Whether the current user can approve/reject change requests (Finance/Owner). */
  canResolveRequest: boolean
  /** Display name of the current user, used as the approving/rejecting actor. */
  actorName: string
  /** Opens the read-only order detail sheet for the given order. */
  onSelectOrder: (order: OrderTableRow) => void
  /** Approves the pending change request for the given order number. */
  onApprove: (orderNumber: string, actorName: string, note: string) => void
  /** Rejects the pending change request for the given order number, with an optional note. */
  onReject: (orderNumber: string, actorName: string, note: string) => void
}

/**
 * @description Renders the list of orders with a pending Admin-submitted
 * change request, each expandable inline into an Approve/Reject action (or
 * a note-entry step for Reject). Returns null when there are no requests to
 * show.
 */
export const ChangeRequestList: FC<ChangeRequestListProps> = ({
  orders,
  canResolveRequest,
  actorName,
  onSelectOrder,
  onApprove,
  onReject,
}) => {
  const [actionOrderNumber, setActionOrderNumber] = useState<string | null>(null)
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null)
  const [actionReason, setActionReason] = useState('')

  if (orders.length === 0) return null

  return (
    <div className="space-y-2">
      <header>
        <h2 className="text-xs font-semibold text-muted-foreground">
          Change requests awaiting review
        </h2>
        <p className="text-xs text-muted-foreground">
          Submitted by Admin/Owner on locked (finished) orders. Approving a
          cancellation voids it immediately; approving an edit only unlocks
          it for them to make the change themselves.
        </p>
      </header>
      {orders.map((order) => {
        const request = order.pendingChangeRequest
        if (!request) return null
        const isActing = actionOrderNumber === order.orderNumber

        return (
          <article
            key={order.orderNumber}
            role="button"
            tabIndex={0}
            onClick={() => onSelectOrder(order)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectOrder(order)
              }
            }}
            className="cursor-pointer space-y-2 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 transition hover:bg-warning/15"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {order.customerName} · {order.orderNumber}
                </p>
                <p className="text-2xs text-muted-foreground">
                  {request.type === 'cancel' ? 'Cancellation' : 'Edit'} request
                  from {request.requestedBy}
                </p>
                <p className="mt-1 text-xs text-foreground/90">
                  Reason: {request.reason}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-foreground">
                {formatIdr(order.totalIdr)}
              </span>
            </div>

            {canResolveRequest && (
              <div onClick={(event) => event.stopPropagation()}>
                {isActing ? (
                  <div className="space-y-1.5">
                    <label className="block text-2xs font-semibold text-foreground">
                      Required reason for {actionType === 'approve' ? (request.type === 'cancel' ? 'cancellation approval' : 'force unlock') : 'rejection'}
                    </label>
                    <textarea
                      value={actionReason}
                      onChange={(event) => setActionReason(event.target.value)}
                      placeholder="Explain why this action is necessary"
                      rows={2}
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/30 dark:focus:ring-primary/40"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => { setActionOrderNumber(null); setActionType(null); setActionReason('') }} className="h-11 rounded-full px-[18px] text-sm font-medium text-muted-foreground hover:bg-muted">Back</button>
                      <button
                        type="button"
                        disabled={actionReason.trim().length < 5}
                        onClick={() => {
                          if (actionType === 'approve') onApprove(order.orderNumber, actorName, actionReason.trim())
                          else onReject(order.orderNumber, actorName, actionReason.trim())
                          setActionOrderNumber(null); setActionType(null); setActionReason('')
                        }}
                        className={`h-11 rounded-full px-[18px] text-sm font-medium text-white shadow-ios-sm disabled:cursor-not-allowed disabled:opacity-40 ${actionType === 'approve' ? 'bg-success' : 'bg-destructive'}`}
                      >
                        Confirm {actionType === 'approve' ? 'approve' : 'reject'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => { setActionOrderNumber(order.orderNumber); setActionType('reject'); setActionReason('') }} className="h-11 rounded-full border border-destructive/30 bg-destructive/5 px-[18px] text-sm font-medium text-destructive">Reject</button>
                    <button type="button" onClick={() => { setActionOrderNumber(order.orderNumber); setActionType('approve'); setActionReason('') }} className="h-11 rounded-full bg-success px-[18px] text-sm font-medium text-white">Approve</button>
                  </div>
                )}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

export default ChangeRequestList
