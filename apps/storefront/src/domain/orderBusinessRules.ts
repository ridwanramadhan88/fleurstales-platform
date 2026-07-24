/**
 * @file orderBusinessRules.ts
 * @description Public gateway for order-related business decisions.
 *
 * UI, controllers, and stores should import order authorization, lifecycle, Finance-lock, and refund rules from this module instead of
 * reaching into individual rule modules. The focused domain modules remain
 * the implementation source of truth; this gateway gives the application one
 * stable business-rule boundary for a future API/backend implementation.
 */

import type { PermissionMatrix } from '../types/settings'
import type { OrderTableRow } from '../types/orders'
import type { UserRole } from '../store/userStore'
import { canEditSection } from '../config/permissions'
import type { OrderActor } from './orderAuthorizationDomain'

export type BusinessRuleDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

export const canCreateOrderForBranch = ({
  actor,
  branch,
  orderType,
  permissions,
}: {
  actor: OrderActor
  branch: string
  orderType: 'walk_in' | 'admin_created' | 'customer_created'
  permissions: PermissionMatrix
}): BusinessRuleDecision => {
  if (orderType === 'customer_created') return { allowed: true }

  if (actor.role === 'florist') {
    return { allowed: false, reason: 'Florists cannot create orders.' }
  }

  if (!canEditSection(actor.role, 'orders', permissions)) {
    return { allowed: false, reason: 'You do not have permission to create orders.' }
  }

  const isCrossBranchRole = actor.role === 'owner' || actor.role === 'finance'
  if (!isCrossBranchRole && !actor.branchId && actor.employeeId) {
    return {
      allowed: false,
      reason: 'No active branch assignment was found for your shift.',
    }
  }
  if (!isCrossBranchRole && actor.branchId !== branch) {
    return {
      allowed: false,
      reason: 'You cannot create an order outside your assigned branch.',
    }
  }

  return { allowed: true }
}

/** UI eligibility before a correction note is entered. The command still
 * calls canResubmitOrderFinance and validates the note and finished state. */
export const canPrepareFinanceResubmission = (
  order: OrderTableRow,
  role: UserRole,
): boolean =>
  order.financeVerificationStatus === 'rejected' &&
  (role === 'admin' || role === 'owner')


export const getAdminHandlerEmployeeId = (
  actor: Pick<OrderActor, 'role' | 'employeeId'>,
): string | undefined =>
  actor.role === 'admin'
    ? actor.employeeId
    : undefined

export {
  authorizeOrderMutation,
  canViewOrder,
  isOrderInActorRowScope,
} from './orderAuthorizationDomain'
export type {
  OrderActor,
  OrderAuthorizationResult,
  OrderMutationKind,
} from './orderAuthorizationDomain'

export * from './orderStatusTransitionDomain'
export * from './orderRefundDomain'

export {
  NON_CANCELLABLE_STATUSES,
  TERMINAL_ISSUE_STATUSES,
  WORKFLOW_EXCEPTION_STATUSES,
  applyApprovedEditChangeRequest,
  applyFinanceRejection,
  applyFinanceResubmission,
  applyFinanceReviewMark,
  applyFinanceVerification,
  applyRejectedChangeRequest,
  applySubmittedChangeRequest,
  applyUnlockedEditFinalization,
  canCancelOrder,
  canDirectlyEditOrder,
  canEditVerifiedOrder,
  canMakeOrderFinanceDecision,
  canResolveChangeRequest,
  canResubmitOrderFinance,
  canSubmitChangeRequest,
  canVerifyOrder,
  canVerifyOrderFinance,
  createOrderChangeRequest,
  isMarkedForFinanceReview,
  isPendingFinanceVerification,
  isOrderFinished,
  isOrderLocked,
  isRejectedByFinance,
  isTerminalIssueOrder,
  isTerminalIssueStatus,
  isWorkflowHappyPathStatus,
} from './orderWorkflowDomain'
export type {
  OrderFinanceDecision,
  OrderFinanceDecisionCode,
  OrderFinanceDecisionType,
  OrderFinanceResubmissionResult,
} from './orderWorkflowDomain'
