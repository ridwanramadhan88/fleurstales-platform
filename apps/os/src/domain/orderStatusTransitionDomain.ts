/**
 * @file orderStatusTransitionDomain.ts
 * @description The single pure command for changing an order lifecycle
 * status. Every runtime status writer must call this command and respect its
 * result before mutating state or emitting events.
 */

import type { OrderFulfillment, OrderStatus, OrderTableRow } from '../types/orders'
import type { UserRole } from '../store/userStore'
import {
  canDirectlyEditOrder,
  canResolveChangeRequest,
  isOrderFinished,
  isOrderLocked,
  isTerminalIssueStatus,
} from './orderWorkflowDomain'

export type OrderStatusTransitionSource =
  | 'workflow'
  | 'edit'
  | 'undo'
  | 'change_request_approval'

export interface OrderStatusTransitionActor {
  name: string
  role: UserRole
}

export interface OrderStatusUndoDescriptor {
  /** Status before the original transition. */
  previousStatus: OrderStatus
  /** Status written by the original transition; must still be current. */
  nextStatus: OrderStatus
  /** Only normal UI/edit transitions can expose Undo. */
  originalSource: 'workflow' | 'edit'
}

export interface TransitionOrderStatusInput {
  order: OrderTableRow | null | undefined
  nextStatus: OrderStatus
  actor: OrderStatusTransitionActor
  source: OrderStatusTransitionSource
  /** Current owner-configurable Orders edit permission for actor.role. */
  canEditOrders: boolean
  /** Deterministic timestamp supplied by the store. */
  transitionedAt: string
  /** Restores an exact completion timestamp during Undo. */
  completedAtOverride?: string
  /** Required when source === 'undo'. */
  undoOf?: OrderStatusUndoDescriptor
}

export type OrderStatusTransitionCode =
  | 'ORDER_NOT_FOUND'
  | 'SAME_STATUS'
  | 'NOT_PERMITTED'
  | 'ORDER_LOCKED'
  | 'TERMINAL_STATUS'
  | 'INVALID_FULFILLMENT_STATUS'
  | 'ILLEGAL_TRANSITION'
  | 'INVALID_UNDO'
  | 'CHANGE_REQUEST_REQUIRED'
  | 'CHANGE_REQUEST_NOT_CANCELLATION'
  | 'ORDER_NOT_FINISHED'

export type OrderStatusTransitionResult =
  | {
      allowed: true
      order: OrderTableRow
      previousStatus: OrderStatus
      nextStatus: OrderStatus
    }
  | {
      allowed: false
      code: OrderStatusTransitionCode
      reason: string
    }

const DELIVERY_PIPELINE: OrderStatus[] = [
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'delivering',
  'delivered',
]

const PICKUP_PIPELINE: OrderStatus[] = [
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'picked_up',
]

/** Actual business completion occurs only when delivery/pickup is completed. */
const COMPLETION_TIMESTAMP_STATUSES: OrderStatus[] = ['delivered', 'picked_up']

const pipelineFor = (fulfillment: OrderFulfillment): OrderStatus[] =>
  fulfillment === 'delivery' ? DELIVERY_PIPELINE : PICKUP_PIPELINE

const denied = (
  code: OrderStatusTransitionCode,
  reason: string,
): OrderStatusTransitionResult => ({ allowed: false, code, reason })

const hasRuntimeStatusPermission = (
  order: OrderTableRow,
  actor: OrderStatusTransitionActor,
  canEditOrders: boolean,
): boolean => {
  // Finance has a narrow direct-edit override only once an order is locked;
  // outside that state it remains read-only in the general Orders section.
  if (canEditOrders) return true
  return isOrderLocked(order) && canDirectlyEditOrder(order, actor.role)
}

const validateNormalTransition = ({
  order,
  nextStatus,
  actor,
  canEditOrders,
}: Pick<
  TransitionOrderStatusInput,
  'order' | 'nextStatus' | 'actor' | 'canEditOrders'
>): OrderStatusTransitionResult | null => {
  if (!order) {
    return denied('ORDER_NOT_FOUND', 'The order could not be found.')
  }

  if (!hasRuntimeStatusPermission(order, actor, canEditOrders)) {
    return denied('NOT_PERMITTED', 'This role cannot change order statuses.')
  }

  if (!canDirectlyEditOrder(order, actor.role)) {
    return denied(
      'ORDER_LOCKED',
      'This finished order requires Finance review or an approved change request.',
    )
  }

  if (order.status === nextStatus) {
    return denied('SAME_STATUS', 'The order is already in that status.')
  }

  if (isTerminalIssueStatus(order.status)) {
    return denied('TERMINAL_STATUS', 'Cancelled and failed orders are immutable.')
  }

  const pipeline = pipelineFor(order.fulfillment)

  if (nextStatus !== 'cancelled' && nextStatus !== 'failed' && !pipeline.includes(nextStatus)) {
    return denied(
      'INVALID_FULFILLMENT_STATUS',
      `Status ${nextStatus} is not valid for a ${order.fulfillment} order.`,
    )
  }

  // Cancellation is an explicit exception path. Finished orders reach this
  // branch only for Finance, because the lock check above blocks everyone
  // else; Owner/Admin must use an approved cancellation request instead.
  if (nextStatus === 'cancelled') return null

  // Failure is valid only while fulfillment is still in progress. A settled
  // order must be voided through cancellation review, never rewritten as a
  // failed delivery after the fact.
  if (nextStatus === 'failed') {
    return isOrderFinished(order)
      ? denied('ILLEGAL_TRANSITION', 'A finished order cannot be changed to failed.')
      : null
  }

  const currentIndex = pipeline.indexOf(order.status)
  const nextIndex = pipeline.indexOf(nextStatus)
  if (currentIndex < 0 || nextIndex !== currentIndex + 1) {
    return denied(
      'ILLEGAL_TRANSITION',
      'Order statuses must follow the next step in the fulfillment pipeline.',
    )
  }

  return null
}

const validateApprovalTransition = ({
  order,
  nextStatus,
  actor,
}: Pick<TransitionOrderStatusInput, 'order' | 'nextStatus' | 'actor'>): OrderStatusTransitionResult | null => {
  if (!order) return denied('ORDER_NOT_FOUND', 'The order could not be found.')

  if (!canResolveChangeRequest(actor.role)) {
    return denied('NOT_PERMITTED', 'This role cannot approve order change requests.')
  }

  if (!order.pendingChangeRequest) {
    return denied('CHANGE_REQUEST_REQUIRED', 'There is no pending change request to approve.')
  }

  if (order.pendingChangeRequest.type !== 'cancel' || nextStatus !== 'cancelled') {
    return denied(
      'CHANGE_REQUEST_NOT_CANCELLATION',
      'This transition requires a pending cancellation request.',
    )
  }

  if (!isOrderFinished(order)) {
    return denied(
      'ORDER_NOT_FINISHED',
      'Cancellation approval is reserved for finished, locked orders.',
    )
  }

  if (order.status === nextStatus) {
    return denied('SAME_STATUS', 'The order is already in that status.')
  }

  return null
}

const validateUndoTransition = (input: TransitionOrderStatusInput): OrderStatusTransitionResult | null => {
  const { order, nextStatus, undoOf } = input
  if (!order) return denied('ORDER_NOT_FOUND', 'The order could not be found.')

  if (
    !undoOf ||
    order.status !== undoOf.nextStatus ||
    nextStatus !== undoOf.previousStatus ||
    undoOf.previousStatus === undoOf.nextStatus
  ) {
    return denied('INVALID_UNDO', 'Undo no longer matches the current order transition.')
  }

  // Prove that the original forward transition itself was legal for the same
  // actor and permission context. This prevents callers from using `undo` as
  // a generic terminal-state escape hatch or arbitrary backward jump.
  const originalOrder: OrderTableRow = {
    ...order,
    status: undoOf.previousStatus,
  }
  const originalDecision = validateNormalTransition({
    order: originalOrder,
    nextStatus: undoOf.nextStatus,
    actor: input.actor,
    canEditOrders: input.canEditOrders,
  })

  if (originalDecision) {
    return denied('INVALID_UNDO', 'The original transition is not valid for this actor or order.')
  }

  return null
}

/**
 * @description Applies a legal order-status transition and returns the
 * resulting order. It is pure: callers own persistence and side effects.
 */
export const transitionOrderStatus = (
  input: TransitionOrderStatusInput,
): OrderStatusTransitionResult => {
  const { order, nextStatus, source } = input

  const validation =
    source === 'change_request_approval'
      ? validateApprovalTransition(input)
      : source === 'undo'
        ? validateUndoTransition(input)
        : validateNormalTransition(input)

  if (validation) return validation
  if (!order) return denied('ORDER_NOT_FOUND', 'The order could not be found.')

  const nextOrder: OrderTableRow = {
    ...order,
    status: nextStatus,
    completedAt:
      input.completedAtOverride !== undefined
        ? input.completedAtOverride
        : COMPLETION_TIMESTAMP_STATUSES.includes(nextStatus)
          ? input.transitionedAt
          : order.completedAt,
    ...(source === 'change_request_approval'
      ? { pendingChangeRequest: undefined }
      : null),
  }

  return {
    allowed: true,
    order: nextOrder,
    previousStatus: order.status,
    nextStatus,
  }
}
