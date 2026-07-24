/**
 * @file orderAuthorizationDomain.ts
 * @description Pure, row-level authorization for Orders. Section access is
 * necessary but not sufficient: Florists only see work assigned to their staff account.
 * Every store command must call the
 * corresponding guard; UI visibility is only a convenience.
 */

import type { PermissionMatrix } from '../types/settings'
import type { OrderTableRow } from '../types/orders'
import type { UserRole } from '../store/userStore'
import { canAccessSection, canEditSection } from '../config/permissions'
import { canDirectlyEditOrder, isOrderLocked } from './orderWorkflowDomain'

export interface OrderActor {
  employeeId?: string
  name: string
  role: UserRole
  /** Employment branch. Owner and Finance are intentionally cross-branch. */
  branchId?: string
}

export type OrderMutationKind =
  | 'details'
  | 'status'
  | 'assignment'
  | 'payment'
  | 'fulfillment'
  | 'change_request'
  | 'finance_decision'
  | 'finance_resubmit'
  | 'refund'

export interface OrderAuthorizationResult {
  allowed: boolean
  reason?: string
}

const isCrossBranchRole = (role: UserRole): boolean =>
  role === 'owner' || role === 'finance'

const isWithinActorBranch = (order: OrderTableRow, actor: OrderActor): boolean => {
  if (isCrossBranchRole(actor.role)) return true
  // Branch-scoped staff must have a concrete active assignment. Treating a
  // missing branch as unrestricted would expose every branch to an off-shift
  // or unscheduled Admin/Florist.
  if (!actor.branchId) return !actor.employeeId
  return order.branch === actor.branchId
}

export const isOrderInActorRowScope = (
  order: OrderTableRow,
  actor: OrderActor,
): boolean => {
  if (!isWithinActorBranch(order, actor)) return false

  if (actor.role === 'owner' || actor.role === 'admin' || actor.role === 'finance') {
    return true
  }
  if (actor.role === 'florist') {
    return order.floristAssignedEmployeeId === actor.employeeId
  }
  return false
}

export const canViewOrder = (
  order: OrderTableRow,
  actor: OrderActor,
  permissions: PermissionMatrix,
): boolean =>
  canAccessSection(actor.role, 'orders', permissions) &&
  isOrderInActorRowScope(order, actor)

export const authorizeOrderMutation = ({
  order,
  actor,
  permissions,
  kind,
}: {
  order: OrderTableRow
  actor: OrderActor
  permissions: PermissionMatrix
  kind: OrderMutationKind
}): OrderAuthorizationResult => {
  if (!canViewOrder(order, actor, permissions)) {
    return { allowed: false, reason: 'This order is outside your permitted scope.' }
  }

  if (kind === 'finance_decision') {
    return actor.role === 'finance' || actor.role === 'owner'
      ? { allowed: true }
      : { allowed: false, reason: 'Only Finance or Owner can make this decision.' }
  }

  if (kind === 'change_request') {
    return actor.role === 'admin' || actor.role === 'owner'
      ? { allowed: true }
      : { allowed: false, reason: 'Only Admin or Owner can submit this request.' }
  }

  if (kind === 'finance_resubmit') {
    return actor.role === 'admin' || actor.role === 'owner'
      ? { allowed: true }
      : { allowed: false, reason: 'Only Admin or Owner can resubmit a rejected order.' }
  }


  if (kind === 'refund') {
    return actor.role === 'finance' || actor.role === 'owner'
      ? { allowed: true }
      : { allowed: false, reason: 'Only Finance or Owner can initiate refunds; only Finance can complete them.' }
  }

  const hasSectionEdit = canEditSection(actor.role, 'orders', permissions)
  const financeLockedOverride =
    actor.role === 'finance' && isOrderLocked(order) && canDirectlyEditOrder(order, actor.role)

  if (kind === 'status') {
    const canOperateStatus = actor.role === 'owner' || actor.role === 'admin' || financeLockedOverride
    if (!canOperateStatus || (!hasSectionEdit && !financeLockedOverride)) {
      return { allowed: false, reason: 'Only Owner or Admin can advance active order statuses.' }
    }
    if (!canDirectlyEditOrder(order, actor.role)) {
      return {
        allowed: false,
        reason: 'This finished order requires Finance review or an approved change request.',
      }
    }
    return { allowed: true }
  }

  if (kind === 'details' || kind === 'assignment' || kind === 'fulfillment') {
    const roleAllowed = actor.role === 'owner' || actor.role === 'admin' || financeLockedOverride
    if (!roleAllowed || (!hasSectionEdit && !financeLockedOverride)) {
      return { allowed: false, reason: 'Your role cannot change these order details.' }
    }
    if (!canDirectlyEditOrder(order, actor.role)) {
      return {
        allowed: false,
        reason: 'This finished order requires Finance review or an approved change request.',
      }
    }
    return { allowed: true }
  }

  if (kind === 'payment') {
    const roleAllowed = actor.role === 'owner' || actor.role === 'admin' || financeLockedOverride
    if (!roleAllowed || (!hasSectionEdit && !financeLockedOverride)) {
      return { allowed: false, reason: 'Your role cannot update order payment.' }
    }
    if (!canDirectlyEditOrder(order, actor.role)) {
      return {
        allowed: false,
        reason: 'This finished order requires Finance review or an approved change request.',
      }
    }
    return { allowed: true }
  }

  return { allowed: false, reason: 'This order action is not permitted.' }
}
