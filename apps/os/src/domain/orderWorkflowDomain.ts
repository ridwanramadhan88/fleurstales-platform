/**
 * @file orderWorkflowDomain.ts
 * @description Domain layer for order workflow and Finance verification — distinct
 * from financeDomain.ts (which covers the general income/expense ledger).
 *
 * Business rules encoded here:
 * - Finance (and Owner) verify orders one by one. An order is locked from
 *   direct Admin/Owner edits from the moment it finishes its fulfillment
 *   pipeline (delivered/picked_up) — not only after Finance has verified
 *   it — since it's sitting in Finance's queue the whole time either way,
 *   and an uncoordinated edit during that window would change the numbers
 *   Finance is looking at without Finance seeing the update. Only Finance
 *   can edit or void a locked order directly.
 * - Admin and Owner can only submit an edit or cancellation *request* on a
 *   locked order, with a required reason, for Finance to review.
 * - For 'cancel' requests, Finance approving voids the order directly.
 * - For 'edit' requests, Finance approving does NOT apply any changes
 *   itself — it sets `editUnlocked: true`, letting Admin/Owner make the
 *   actual edit afterward through the normal edit form (which writes
 *   straight to the order and always shows correctly in the Finance list).
 *   The order re-locks automatically the moment that edit is saved. If the
 *   order had already been finance-verified before the request, saving
 *   that edit also resets `financeVerified` back to false (see
 *   ordersStore.finalizeUnlockedEdit) — the revision may have changed the
 *   numbers Finance already signed off on, so it drops back into the
 *   pending-verification queue for Finance to re-check rather than keeping
 *   a stale approval.
 * - Revenue is "confirmed" only for finance-verified orders; everything
 *   else is "pending" revenue, no matter its payment/order status.
 *
 * This file is PURE and has no side effects: no React/UI imports, no
 * direct store mutations, fully deterministic based on inputs.
 */

import type {
  OrderChangeRequestType,
  OrderChangeRequest,
  OrderStatus,
  OrderTableRow,
} from '../types/orders'
export { getRevenueConfidence } from './orderFinanceMathDomain'
export type { RevenueConfidence } from './orderFinanceMathDomain'
import type { UserRole } from '../store/userStore'
import { isVoidedRevenueOrder } from './orderFinanceMathDomain'

/**
 * @description Roles allowed to verify orders and resolve pending change
 * requests in the Finance verification queue. Owner has full section access
 * by default, while this narrower role list keeps the order-level workflow
 * explicit and independently testable.
 */
const FINANCE_DECISION_ROLES: UserRole[] = ['finance', 'owner']

/**
 * @description Roles allowed to directly edit or void/cancel an order that
 * is currently locked (finished, and not under an active edit-unlock — see
 * isOrderLocked). Everyone else — including Owner and Admin — must go
 * through the change-request flow instead (see canSubmitChangeRequest).
 * Only Finance can act on a locked order directly.
 */
const EDIT_LOCK_OVERRIDE_ROLES: UserRole[] = ['finance']

/**
 * @description Statuses that are terminal because the order hit an exception,
 * not because fulfillment completed normally.
 */
export const TERMINAL_ISSUE_STATUSES: OrderStatus[] = ['cancelled', 'failed']

/**
 * @description Statuses excluded from the normal fulfillment pipeline.
 */
export const WORKFLOW_EXCEPTION_STATUSES: OrderStatus[] = TERMINAL_ISSUE_STATUSES

/**
 * @description Statuses where a direct cancel action no longer makes sense.
 */
export const NON_CANCELLABLE_STATUSES: OrderStatus[] = [
  ...TERMINAL_ISSUE_STATUSES,
  'delivered',
  'picked_up',
]

export const isTerminalIssueStatus = (status: OrderStatus): boolean =>
  TERMINAL_ISSUE_STATUSES.includes(status)

export const isTerminalIssueOrder = (order: OrderTableRow): boolean =>
  isTerminalIssueStatus(order.status)

export const isWorkflowHappyPathStatus = (status: OrderStatus): boolean =>
  !WORKFLOW_EXCEPTION_STATUSES.includes(status)

export const canCancelOrder = (order: OrderTableRow): boolean =>
  !NON_CANCELLABLE_STATUSES.includes(order.status)

/**
 * @description Whether a role can directly verify an order in Finance.
 */
export const canVerifyOrder = (role: UserRole): boolean =>
  FINANCE_DECISION_ROLES.includes(role)

/**
 * @description Whether a role can directly edit or void/cancel an order
 * that has already been verified by Finance. Admin and Owner must submit a
 * change request instead — see canSubmitChangeRequest.
 */
export const canEditVerifiedOrder = (role: UserRole): boolean =>
  EDIT_LOCK_OVERRIDE_ROLES.includes(role)

/**
 * @description Whether a role can submit an edit/cancellation request for
 * Finance to review. Modeled distinctly from canEditVerifiedOrder so the
 * "submit for review" capability can be granted to Admin/Owner without also
 * granting direct edit rights on locked orders.
 */
export const canSubmitChangeRequest = (role: UserRole): boolean =>
  role === 'admin' || role === 'owner'

/**
 * @description Whether a role can approve/reject a pending change request.
 * Same roles as direct verification — Finance and Owner.
 */
export const canResolveChangeRequest = (role: UserRole): boolean =>
  FINANCE_DECISION_ROLES.includes(role)

/**
 * @description Order statuses that represent a completed order — the
 * fulfillment pipeline has been fully advanced by Admin/Owner (delivered
 * for delivery orders, picked up for pickup orders). Finance only takes
 * verify/reject action on orders once they reach this state: verifying an
 * order that's still in progress would mean confirming revenue before the
 * order (and its final total) is actually settled.
 */
const FINISHED_ORDER_STATUSES: OrderTableRow['status'][] = ['delivered', 'picked_up']

/**
 * @description Whether an order has finished its fulfillment pipeline
 * (delivered / picked up) and is therefore eligible to enter Finance's
 * order verification queue. Cancelled/failed orders are excluded — they
 * carry no revenue to verify — as are any orders still in progress.
 */
export const isOrderFinished = (order: OrderTableRow): boolean =>
  FINISHED_ORDER_STATUSES.includes(order.status)

/**
 * @description Whether the given order is currently locked from direct
 * Admin/Owner edits.
 *
 * The lock now triggers the moment an order finishes its fulfillment
 * pipeline (delivered / picked_up) — *not* only once Finance has verified
 * it. Reasoning: once an order is sitting in Finance's verification queue,
 * an uncoordinated Admin edit changes the very numbers Finance is looking
 * at without Finance ever seeing the update (this was bug: "admin edits a
 * finished-but-not-yet-verified order and the change never reaches the
 * Finance list"). Locking at "finished" instead of "verified" closes that
 * gap — Admin must go through the change-request flow the whole time the
 * order is sitting in that queue, verified or not.
 *
 * `editUnlocked` is a one-time exemption: once Finance approves an 'edit'
 * change request, this order is treated as unlocked so Admin can make the
 * actual edit — see canDirectlyEditOrder.
 */
export const isOrderLocked = (order: OrderTableRow): boolean =>
  isOrderFinished(order) && !order.editUnlocked

/**
 * @description Determines whether `role` may directly edit or void this
 * specific order right now (not accounting for other unrelated guards like
 * terminal status). Orders that haven't finished their fulfillment pipeline
 * yet can be edited by anyone with normal Orders edit access — this
 * function only enforces the finished-order lock. Once locked,
 * `order.editUnlocked` (set by an approved edit request) is the only way
 * back in for Admin/Owner short of being Finance.
 */
export const canDirectlyEditOrder = (
  order: OrderTableRow,
  role: UserRole,
): boolean => {
  if (!isOrderLocked(order)) return true
  return canEditVerifiedOrder(role)
}

/**
 * @description Whether an order is currently eligible for first-time
 * Finance verification: it must be finished (delivered/picked up), not
 * already verified, and not already rejected. Orders marked for review stay
 * in this bucket too — "review" is a soft flag, not a terminal decision, so
 * the order keeps showing up until Finance verifies or rejects it. This is
 * the single source of truth for what populates the "Order list (finished)"
 * verification queue.
 */
export const isPendingFinanceVerification = (order: OrderTableRow): boolean =>
  isOrderFinished(order) &&
  !order.financeVerified &&
  order.financeVerificationStatus !== 'rejected'

/**
 * @description Whether an order's payment information is internally
 * consistent enough for Finance to sign off on — this checks for broken
 * *data*, not payment progress. `paymentStatus` itself (unpaid / partial /
 * paid / refund_pending / refunded) is not gated here: a finished order can
 * legitimately be mid-refund (see `orderFinanceMathDomain.isRefundOrder`,
 * which tracks refund exposure as its own cross-cut rather than excluding
 * refunded orders from revenue), and the payment-progress gate that keeps
 * an order from reaching `picked_up`/`delivered` while outstanding lives
 * separately in `orderPaymentGateDomain.shouldGateOrderAdvanceForPayment`.
 * What this catches is a `paidAmountIdr` that couldn't possibly be correct:
 * negative, or larger than the order total — both real invariant
 * violations per `reconcilePaidAmountIdr`'s `[0, totalIdr]` contract.
 */
const hasValidPaymentInfoForVerification = (order: OrderTableRow): boolean => {
  if (order.paidAmountIdr === undefined) return true
  if (order.paidAmountIdr < 0) return false
  if (order.paidAmountIdr > order.totalIdr) return false
  return true
}

/**
 * @description Finance decisions that can be made on a finished order.
 */
export type OrderFinanceDecisionType = 'verify' | 'reject' | 'review'

export type OrderFinanceDecisionCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_CANCELLED'
  | 'ORDER_VOIDED'
  | 'ALREADY_VERIFIED'
  | 'ORDER_NOT_FINISHED'
  | 'INVALID_PAYMENT_INFO'
  | 'NOT_PERMITTED'
  | 'NOTE_REQUIRED'

export type OrderFinanceDecision =
  | { allowed: true }
  | {
      allowed: false
      code: OrderFinanceDecisionCode
      reason: string
    }

/**
 * @description The single authoritative eligibility gate for every Finance
 * decision on an order. Verification, rejection, and review marking must all
 * pass the same role, lifecycle, void/cancel, completion, and payment-data
 * checks. Reject/review also require a meaningful note so the decision is
 * auditable rather than an unexplained state change.
 */
export const canMakeOrderFinanceDecision = ({
  order,
  role,
  decision,
  note,
  capabilityAllowed = true,
}: {
  order: OrderTableRow | null | undefined
  role: UserRole
  decision: OrderFinanceDecisionType
  note?: string
  capabilityAllowed?: boolean
}): OrderFinanceDecision => {
  if (!order) {
    return { allowed: false, code: 'ORDER_NOT_FOUND', reason: 'The order could not be found.' }
  }

  if (!capabilityAllowed || !canVerifyOrder(role)) {
    return {
      allowed: false,
      code: 'NOT_PERMITTED',
      reason: 'This role is not permitted to make Finance decisions on orders.',
    }
  }

  if (order.status === 'cancelled') {
    return {
      allowed: false,
      code: 'ORDER_CANCELLED',
      reason: 'A cancelled order cannot receive a Finance decision.',
    }
  }

  if (isVoidedRevenueOrder(order)) {
    return {
      allowed: false,
      code: 'ORDER_VOIDED',
      reason: 'A voided order carries no revenue to decide.',
    }
  }

  if (order.financeVerified) {
    return {
      allowed: false,
      code: 'ALREADY_VERIFIED',
      reason: 'This order has already been finance-verified.',
    }
  }

  if (!isOrderFinished(order)) {
    return {
      allowed: false,
      code: 'ORDER_NOT_FINISHED',
      reason: 'The order must be completed before a Finance decision.',
    }
  }

  if (!hasValidPaymentInfoForVerification(order)) {
    return {
      allowed: false,
      code: 'INVALID_PAYMENT_INFO',
      reason: 'The order payment information is not in a verifiable state.',
    }
  }

  if (decision === 'reject' && !note?.trim()) {
    return {
      allowed: false,
      code: 'NOTE_REQUIRED',
      reason: 'A rejection reason is required.',
    }
  }

  return { allowed: true }
}

/** Backward-compatible verification wrapper for existing read-only callers. */
export const canVerifyOrderFinance = (
  order: OrderTableRow | null | undefined,
  role: UserRole,
): OrderFinanceDecision =>
  canMakeOrderFinanceDecision({ order, role, decision: 'verify' })

/**
 * @description Whether an order has been flagged by Finance for a closer
 * look later, without a verify/reject decision yet.
 */
export const isMarkedForFinanceReview = (order: OrderTableRow): boolean =>
  order.financeVerificationStatus === 'review'

/**
 * @description Whether Finance has rejected this order outright.
 */
export const isRejectedByFinance = (order: OrderTableRow): boolean =>
  order.financeVerificationStatus === 'rejected'

export const createOrderChangeRequest = ({
  orderNumber,
  type,
  reason,
  requestedBy,
  requestedAt,
}: {
  orderNumber: string
  type: OrderChangeRequestType
  reason: string
  requestedBy: string
  requestedAt: string
}): OrderChangeRequest => ({
  id: `chg_${orderNumber}_${Date.parse(requestedAt)}`,
  type,
  reason,
  requestedBy,
  requestedAt,
})

export const applySubmittedChangeRequest = (
  order: OrderTableRow,
  request: OrderChangeRequest,
): OrderTableRow => ({
  ...order,
  pendingChangeRequest: request,
})

/**
 * @description Applies only an approved edit request. Approved cancellation
 * requests are intentionally excluded: they must go through
 * transitionOrderStatus via ordersStore.updateOrderStatus so there is one
 * lifecycle writer, one guard, and one event path.
 */
export const applyApprovedEditChangeRequest = (order: OrderTableRow): OrderTableRow => {
  const request = order.pendingChangeRequest
  if (!request || request.type !== 'edit') return order

  return {
    ...order,
    editUnlocked: true,
    pendingChangeRequest: undefined,
  }
}

export const applyRejectedChangeRequest = (order: OrderTableRow): OrderTableRow => ({
  ...order,
  pendingChangeRequest: undefined,
})

export const applyUnlockedEditFinalization = (order: OrderTableRow): OrderTableRow => {
  if (!order.editUnlocked) return order

  return {
    ...order,
    editUnlocked: false,
    ...(order.financeVerified
      ? {
          financeVerified: false,
          financeVerifiedBy: undefined,
          financeVerifiedAt: undefined,
          financeVerificationStatus: undefined,
          financeVerificationNote: undefined,
        }
      : null),
  }
}

export const applyFinanceVerification = (
  order: OrderTableRow,
  actor: string,
  verifiedAt: string,
): OrderTableRow => ({
  ...order,
  financeVerified: true,
  financeVerifiedBy: actor,
  financeVerifiedAt: verifiedAt,
  financeVerificationStatus: undefined,
  financeVerificationNote: undefined,
})

export const applyFinanceRejection = (
  order: OrderTableRow,
  actor: string,
  note: string | undefined,
  decidedAt: string,
): OrderTableRow => ({
  ...order,
  financeVerificationStatus: 'rejected',
  editUnlocked: true,
  financeVerificationNote: note,
  financeVerificationActor: actor,
  financeVerificationAt: decidedAt,
})

export const applyFinanceReviewMark = (
  order: OrderTableRow,
  actor: string,
  note: string | undefined,
  decidedAt: string,
): OrderTableRow => ({
  ...order,
  financeVerificationStatus: 'review',
  financeVerificationNote: note,
  financeVerificationActor: actor,
  financeVerificationAt: decidedAt,
})

export type OrderFinanceResubmissionResult =
  | { allowed: true }
  | { allowed: false; reason: string }

/** Admin/Owner correction handoff after an explicit Finance rejection. */
export const canResubmitOrderFinance = ({
  order,
  role,
  note,
}: {
  order: OrderTableRow | null | undefined
  role: UserRole
  note?: string
}): OrderFinanceResubmissionResult => {
  if (!order) return { allowed: false, reason: 'The order could not be found.' }
  if (role !== 'admin' && role !== 'owner') {
    return { allowed: false, reason: 'Only Admin or Owner can resubmit a rejected order.' }
  }
  if (order.financeVerificationStatus !== 'rejected') {
    return { allowed: false, reason: 'Only a Finance-rejected order can be resubmitted.' }
  }
  if (!isOrderFinished(order)) {
    return { allowed: false, reason: 'The order must remain completed before resubmission.' }
  }
  if (!note?.trim()) {
    return { allowed: false, reason: 'Describe what was corrected before resubmitting.' }
  }
  return { allowed: true }
}

export const applyFinanceResubmission = (
  order: OrderTableRow,
  actor: string,
  note: string,
  submittedAt: string,
): OrderTableRow => ({
  ...order,
  financeVerified: false,
  financeVerifiedBy: undefined,
  financeVerifiedAt: undefined,
  financeVerificationStatus: undefined,
  financeVerificationNote: undefined,
  financeVerificationActor: undefined,
  financeVerificationAt: undefined,
  editUnlocked: false,
  financeResubmittedBy: actor,
  financeResubmittedAt: submittedAt,
  financeResubmissionNote: note.trim(),
  financeSubmissionRevision: order.revision ?? 1,
})
