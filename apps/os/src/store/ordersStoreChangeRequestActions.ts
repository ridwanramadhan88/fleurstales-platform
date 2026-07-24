import type { OrderChangeRequest } from '../types/orders'
import type { OrdersStoreGet, OrdersStoreSet, OrdersStoreState } from './ordersStoreTypes'
import {
  emitOrderStatusChanged,
  emitOrderUpdated,
  evaluateOrderPriorityAndEmitAlerts,
} from '../core/events/eventService'
import {
  applyApprovedEditChangeRequest,
  applyRejectedChangeRequest,
  applySubmittedChangeRequest,
  canResolveChangeRequest,
  createOrderChangeRequest,
} from '../domain/orderBusinessRules'
import { transitionOrderStatus } from '../domain/orderBusinessRules'
import { useSettingsStore } from './settingsStore'
import { finalizeOrderMutation, validateOrderCommand } from './orderCommandSupport'

type ChangeRequestActions = Pick<
  OrdersStoreState,
  'submitChangeRequest' | 'approveChangeRequest' | 'rejectChangeRequest'
>

export const createOrderChangeRequestActions = (
  set: OrdersStoreSet,
  get: OrdersStoreGet,
): ChangeRequestActions => ({
  submitChangeRequest: ({ orderNumber, expectedRevision, type, reason, actor }) => {
    const target = get().orders.find((order) => order.orderNumber === orderNumber)
    const denied = validateOrderCommand({
      order: target,
      actor,
      expectedRevision,
      kind: 'change_request',
      permissions: useSettingsStore.getState().permissions,
      action: `order.change_request.${type}.submit`,
    })
    if (denied) return denied
    if (target!.pendingChangeRequest) {
      return {
        allowed: false,
        code: 'INVALID_INPUT',
        reason: 'This order already has an unresolved change request.',
      }
    }

    const request = createOrderChangeRequest({
      orderNumber,
      type,
      reason,
      requestedBy: actor.name,
      requestedAt: new Date().toISOString(),
    })
    const updatedOrder = finalizeOrderMutation({
      before: target!,
      after: applySubmittedChangeRequest(target!, request),
      actor,
      action: `order.change_request.${type}.submit`,
      reason,
    })
    set((state) => ({
      orders: state.orders.map((order) =>
        order.orderNumber === orderNumber ? updatedOrder : order,
      ),
    }))
    const label = type === 'cancel' ? 'Cancellation' : 'Edit'
    emitOrderUpdated(updatedOrder, `${label} request submitted by ${actor.name}: ${reason}`)
    return { allowed: true, order: updatedOrder }
  },

  approveChangeRequest: ({ orderNumber, expectedRevision, actor, note }) => {
    const target = get().orders.find((order) => order.orderNumber === orderNumber)
    const denied = validateOrderCommand({
      order: target,
      actor,
      expectedRevision,
      kind: 'finance_decision',
      permissions: useSettingsStore.getState().permissions,
      action: 'order.change_request.approve',
    })
    if (denied) return denied
    const request = target!.pendingChangeRequest
    if (!note?.trim() || note.trim().length < 5) {
      return { allowed: false, code: 'INVALID_INPUT', reason: 'A reason is required for cancellation approval or force unlock.' }
    }
    if (!request || !canResolveChangeRequest(actor.role)) {
      return { allowed: false, code: 'INVALID_INPUT', reason: 'No resolvable request was found.' }
    }

    if (request.type === 'cancel') {
      const transition = transitionOrderStatus({
        order: target!,
        nextStatus: 'cancelled',
        actor,
        source: 'change_request_approval',
        canEditOrders: false,
        transitionedAt: new Date().toISOString(),
      })
      if (!transition.allowed) {
        return { allowed: false, code: 'INVALID_INPUT', reason: transition.reason }
      }
      const updatedOrder = finalizeOrderMutation({
        before: target!,
        after: transition.order,
        actor,
        action: 'order.change_request.cancel.approve',
        reason: request.reason,
      })
      set((state) => ({
        orders: state.orders.map((order) =>
          order.orderNumber === orderNumber ? updatedOrder : order,
        ),
      }))
      emitOrderStatusChanged(updatedOrder, transition.previousStatus, transition.nextStatus)
      emitOrderUpdated(
        updatedOrder,
        `Cancellation request approved by ${actor.name} (requested by ${request.requestedBy})`,
      )
      evaluateOrderPriorityAndEmitAlerts(updatedOrder)
      return { allowed: true, order: updatedOrder }
    }

    const approvedRequest: OrderChangeRequest = request
    const updatedOrder = finalizeOrderMutation({
      before: target!,
      after: applyApprovedEditChangeRequest(target!),
      actor,
      action: 'order.change_request.edit.approve',
      reason: request.reason,
    })
    set((state) => ({
      orders: state.orders.map((order) =>
        order.orderNumber === orderNumber ? updatedOrder : order,
      ),
    }))
    emitOrderUpdated(
      updatedOrder,
      `Edit request approved by ${actor.name} (requested by ${approvedRequest.requestedBy}) — unlocked for editing`,
    )
    return { allowed: true, order: updatedOrder }
  },

  rejectChangeRequest: ({ orderNumber, expectedRevision, actor, note }) => {
    const target = get().orders.find((order) => order.orderNumber === orderNumber)
    const denied = validateOrderCommand({
      order: target,
      actor,
      expectedRevision,
      kind: 'finance_decision',
      permissions: useSettingsStore.getState().permissions,
      action: 'order.change_request.reject',
    })
    if (denied) return denied
    const request = target!.pendingChangeRequest
    if (!note?.trim() || note.trim().length < 5) {
      return { allowed: false, code: 'INVALID_INPUT', reason: 'A reason is required to reject this request.' }
    }
    if (!request || !canResolveChangeRequest(actor.role)) {
      return { allowed: false, code: 'INVALID_INPUT', reason: 'No resolvable request was found.' }
    }

    const updatedOrder = finalizeOrderMutation({
      before: target!,
      after: applyRejectedChangeRequest(target!),
      actor,
      action: `order.change_request.${request.type}.reject`,
      reason: note,
    })
    set((state) => ({
      orders: state.orders.map((order) =>
        order.orderNumber === orderNumber ? updatedOrder : order,
      ),
    }))
    const label = request.type === 'cancel' ? 'Cancellation' : 'Edit'
    emitOrderUpdated(
      updatedOrder,
      `${label} request rejected by ${actor.name}${note ? `: ${note}` : ''} (requested by ${request.requestedBy})`,
    )
    return { allowed: true, order: updatedOrder }
  },
})
