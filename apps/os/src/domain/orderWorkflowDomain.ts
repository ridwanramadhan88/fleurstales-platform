/**
 * @file orderWorkflowDomain.ts
 * @description Pure order workflow and Finance reconciliation rules.
 *
 * Admin confirms the customer payment before production and Finance performs
 * the final reconciliation separately. Fulfillment state is informational for
 * Finance: an order may still be In Progress when its payment is reconciled.
 * Finished orders remain locked from direct edits unless an approved
 * correction/change-request flow explicitly unlocks them.
 */

import type {
  OrderChangeRequestType,
  OrderChangeRequest,
  OrderStatus,
  OrderTableRow,
} from '../types/orders'
import type { UserRole } from '../store/userStore'
import { isVoidedRevenueOrder } from './orderFinanceMathDomain'

export { getRevenueConfidence } from './orderFinanceMathDomain'
export type { RevenueConfidence } from './orderFinanceMathDomain'

const FINANCE_DECISION_ROLES: UserRole[] = ['finance', 'owner']

export const TERMINAL_ISSUE_STATUSES: OrderStatus[] = ['cancelled', 'failed']
export const WORKFLOW_EXCEPTION_STATUSES: OrderStatus[] = TERMINAL_ISSUE_STATUSES
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

export const canVerifyOrder = (role: UserRole): boolean =>
  FINANCE_DECISION_ROLES.includes(role)

/**
 * Compatibility helper retained for existing callers. There is no role-level
 * direct-edit override for a Finance-verified/locked order anymore.
 */
export const canEditVerifiedOrder = (_role: UserRole): boolean => false

export const canSubmitChangeRequest = (role: UserRole): boolean =>
  role === 'admin' || role === 'owner'

export const canResolveChangeRequest = (role: UserRole): boolean =>
  FINANCE_DECISION_ROLES.includes(role)

const FINISHED_ORDER_STATUSES: OrderTableRow['status'][] = ['delivered', 'picked_up']

export const isOrderFinished = (order: OrderTableRow): boolean =>
  FINISHED_ORDER_STATUSES.includes(order.status)

/**
 * Finished orders are locked unless an explicit approved correction/edit flow
 * has temporarily set `editUnlocked`.
 */
export const isOrderLocked = (order: OrderTableRow): boolean =>
  isOrderFinished(order) && !order.editUnlocked

/**
 * Lock-only helper retained for compatibility. Normal role/capability checks
 * are enforced separately by orderAuthorizationDomain. No role can bypass a
 * finished-order lock directly.
 */
export const canDirectlyEditOrder = (
  order: OrderTableRow,
  _role: UserRole,
): boolean => !isOrderLocked(order)

/** Admin-confirmed paid orders wait here until Finance makes the final call. */
export const isPendingFinanceVerification = (order: OrderTableRow): boolean =>
  order.paymentStatus === 'paid' &&
  !isVoidedRevenueOrder(order) &&
  !order.financeVerified &&
  order.financeVerificationStatus !== 'rejected'

const hasValidPaymentInfoForVerification = (order: OrderTableRow): boolean => {
  if (order.paymentStatus !== 'paid') return false
  const paidAmount = order.paidAmountIdr ?? order.totalIdr
  if (paidAmount !== order.totalIdr || paidAmount < 0) return false
  if (order.paymentMethod === 'transfer' && !order.paymentProofUrl) return false
  return true
}

export type OrderFinanceDecisionType = 'verify' | 'reject' | 'review'

export type OrderFinanceDecisionCode =
  | 'ORDER_NOT_FOUND'
  | 'ORDER_CANCELLED'
  | 'ORDER_VOIDED'
  | 'ALREADY_VERIFIED'
  | 'PAYMENT_NOT_CONFIRMED'
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
      reason: 'This order has already been reconciled by Finance.',
    }
  }

  if (order.paymentStatus !== 'paid') {
    return {
      allowed: false,
      code: 'PAYMENT_NOT_CONFIRMED',
      reason: 'Admin must confirm full payment before Finance can reconcile it.',
    }
  }

  if (!hasValidPaymentInfoForVerification(order)) {
    return {
      allowed: false,
      code: 'INVALID_PAYMENT_INFO',
      reason: order.paymentMethod === 'transfer' && !order.paymentProofUrl
        ? 'Transfer evidence is required before Finance can reconcile this payment.'
        : 'The order payment amount is not in a verifiable state.',
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

export const canVerifyOrderFinance = (
  order: OrderTableRow | null | undefined,
  role: UserRole,
): OrderFinanceDecision =>
  canMakeOrderFinanceDecision({ order, role, decision: 'verify' })

export const isMarkedForFinanceReview = (order: OrderTableRow): boolean =>
  order.financeVerificationStatus === 'review'

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
  if (order.paymentStatus !== 'paid') {
    return { allowed: false, reason: 'Confirm full payment before resubmitting to Finance.' }
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
