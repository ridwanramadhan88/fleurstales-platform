import type { OrderTableRow } from '../types/orders'
import type { PermissionMatrix } from '../types/settings'
import type {
  OrderActor,
  OrderMutationKind,
} from '../domain/orderBusinessRules'
import { authorizeOrderMutation } from '../domain/orderBusinessRules'
import {
  checkExpectedOrderRevision,
  getOrderRevision,
  stampOrderRevision,
} from '../domain/orderConcurrencyDomain'
import { useAuditLogStore, type AuditOutcome } from './auditLogStore'
import type { OrderCommandFailure } from './ordersStoreTypes'

export const auditOrderCommand = ({
  order,
  actor,
  action,
  outcome,
  reason,
  previousRevision,
  nextRevision,
  metadata,
}: {
  order: OrderTableRow
  actor: OrderActor
  action: string
  outcome: AuditOutcome
  reason?: string
  previousRevision?: number
  nextRevision?: number
  metadata?: Record<string, unknown>
}): void => {
  useAuditLogStore.getState().append({
    entityType: 'order',
    entityId: order.id ?? order.orderNumber,
    entityLabel: order.orderNumber,
    action,
    outcome,
    actor: {
      employeeId: actor.employeeId ?? 'unknown',
      name: actor.name,
      role: actor.role,
    },
    reason,
    previousRevision,
    nextRevision,
    metadata,
  })
}

export const validateOrderCommand = ({
  order,
  actor,
  expectedRevision,
  kind,
  permissions,
  action,
}: {
  order: OrderTableRow | undefined
  actor: OrderActor
  expectedRevision: number
  kind: OrderMutationKind
  permissions: PermissionMatrix
  action: string
}): OrderCommandFailure | null => {
  if (!order) {
    return {
      allowed: false,
      code: 'ORDER_NOT_FOUND',
      reason: 'Order not found.',
    }
  }

  const authorization = authorizeOrderMutation({ order, actor, permissions, kind })
  if (!authorization.allowed) {
    auditOrderCommand({
      order,
      actor,
      action,
      outcome: 'denied',
      reason: authorization.reason,
      previousRevision: getOrderRevision(order),
    })
    return {
      allowed: false,
      code: 'NOT_PERMITTED',
      reason: authorization.reason ?? 'This order action is not permitted.',
    }
  }

  const revision = checkExpectedOrderRevision(order, expectedRevision)
  if (!revision.allowed) {
    auditOrderCommand({
      order,
      actor,
      action,
      outcome: 'conflict',
      reason: revision.reason,
      previousRevision: revision.currentRevision,
      metadata: { expectedRevision },
    })
    return revision
  }

  return null
}

export const finalizeOrderMutation = ({
  before,
  after,
  actor,
  action,
  reason,
  metadata,
}: {
  before: OrderTableRow
  after: OrderTableRow
  actor: OrderActor
  action: string
  reason?: string
  metadata?: Record<string, unknown>
}): OrderTableRow => {
  const next = stampOrderRevision(after)
  auditOrderCommand({
    order: next,
    actor,
    action,
    outcome: 'succeeded',
    reason,
    previousRevision: getOrderRevision(before),
    nextRevision: getOrderRevision(next),
    metadata,
  })
  return next
}
