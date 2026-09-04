/**
 * @file orderAuthorizationDomain.ts
 * @description Pure, row-level authorization for Orders. Read visibility and
 * operational branch ownership are separate concerns: Owner/Admin/Finance/HR
 * may read company-wide when configured, while Admin mutations remain limited
 * to the active branch. Florists only see work assigned to their staff account.
 * Every store command must call the corresponding guard; UI visibility is only
 * a convenience.
 */

import type { PermissionMatrix } from '../types/settings'
import type { OrderStatus, OrderTableRow } from '../types/orders'
import type { UserRole } from '../store/userStore'
import { canEditSection } from '../config/permissions'
import { DEFAULT_ACTION_PERMISSIONS, hasActionPermission, type ActionPermissionMatrix } from '../config/actionPermissions'
import { isOrderLocked } from './orderWorkflowDomain'

export interface OrderActor {
  employeeId?: string
  name: string
  role: UserRole
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
  | 'change_request_resolution'
  | 'finance_resubmit'
  | 'refund'

export interface OrderAuthorizationResult {
  allowed: boolean
  reason?: string
}

/**
 * Read scope is deliberately branch-independent for staff with company-wide
 * Orders access. Florist visibility is employee-assignment scoped, not branch
 * scoped, so an intentional cross-branch assignment remains visible.
 */
export const isOrderInActorRowScope = (order: OrderTableRow, actor: OrderActor): boolean => {
  if (actor.role === 'owner' || actor.role === 'admin' || actor.role === 'finance' || actor.role === 'hr') {
    return true
  }
  if (actor.role === 'florist') {
    return Boolean(actor.employeeId) && order.floristAssignedEmployeeId === actor.employeeId
  }
  return false
}

/** Admin branch scope is an operational constraint only, never a read filter. */
const isOrderInActorMutationScope = (order: OrderTableRow, actor: OrderActor): boolean => {
  if (actor.role !== 'admin') return true
  return Boolean(actor.branchId) && order.branch === actor.branchId
}

export const canViewOrder = (
  order: OrderTableRow,
  actor: OrderActor,
  permissions: PermissionMatrix,
  actionPermissions: ActionPermissionMatrix = DEFAULT_ACTION_PERMISSIONS,
): boolean => {
  const canRead = hasActionPermission(actor.role, 'orders.read_all', actionPermissions, permissions)
    || hasActionPermission(actor.role, 'orders.read_assigned', actionPermissions, permissions)
  return canRead && isOrderInActorRowScope(order, actor)
}

export const authorizeOrderMutation = ({
  order,
  actor,
  permissions,
  kind,
  actionPermissions = DEFAULT_ACTION_PERMISSIONS,
  nextStatus,
}: {
  order: OrderTableRow
  actor: OrderActor
  permissions: PermissionMatrix
  kind: OrderMutationKind
  actionPermissions?: ActionPermissionMatrix
  nextStatus?: OrderStatus
}): OrderAuthorizationResult => {
  void nextStatus
  if (!canViewOrder(order, actor, permissions, actionPermissions)) {
    return { allowed: false, reason: 'This order is outside your permitted read scope.' }
  }

  const capability = kind === 'status' ? 'orders.advance_status'
    : kind === 'assignment' ? 'orders.assign'
    : kind === 'change_request' ? 'orders.submit_change_request'
    : kind === 'finance_decision' ? 'finance.verify_order'
    : kind === 'change_request_resolution' ? 'orders.resolve_change_request'
    : kind === 'refund' ? 'finance.approve_refund'
    : 'orders.edit'
  if (!hasActionPermission(actor.role, capability, actionPermissions, permissions)) {
    return { allowed: false, reason: 'This action is disabled for your role.' }
  }

  if (!isOrderInActorMutationScope(order, actor)) {
    return { allowed: false, reason: 'This order is outside your operational branch.' }
  }

  if (kind === 'finance_decision' || kind === 'change_request_resolution') {
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
      : { allowed: false, reason: 'Only Finance or Owner can manage refunds.' }
  }

  const hasSectionEdit = canEditSection(actor.role, 'orders', permissions)

  if (kind === 'status') {
    if (actor.role === 'florist') return { allowed: false, reason: 'Florists can view assigned work but cannot change order status.' }
    const canOperateStatus = actor.role === 'owner' || actor.role === 'admin'
    if (!canOperateStatus || !hasSectionEdit) return { allowed: false, reason: 'Only Owner or Admin can advance active order statuses.' }
    if (isOrderLocked(order)) return { allowed: false, reason: 'This finished order requires Finance review or an approved change request.' }
    return { allowed: true }
  }

  if (kind === 'details' || kind === 'assignment' || kind === 'fulfillment') {
    const roleAllowed = actor.role === 'owner' || actor.role === 'admin'
    if (!roleAllowed || !hasSectionEdit) return { allowed: false, reason: 'Your role cannot change these order details.' }
    if (isOrderLocked(order)) return { allowed: false, reason: 'This finished order requires Finance review or an approved change request.' }
    return { allowed: true }
  }

  if (kind === 'payment') {
    const roleAllowed = actor.role === 'owner' || actor.role === 'admin'
    if (!roleAllowed || !hasSectionEdit) return { allowed: false, reason: 'Your role cannot update order payment.' }
    if (isOrderLocked(order)) return { allowed: false, reason: 'This finished order requires Finance review or an approved change request.' }
    return { allowed: true }
  }

  return { allowed: false, reason: 'This order action is not permitted.' }
}
