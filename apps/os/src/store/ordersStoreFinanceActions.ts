import type { OrdersStoreSet, OrdersStoreState } from './ordersStoreTypes'
import { isActionAuthorized } from '../config/authorization'
import { emitOrderUpdated } from '../core/events/eventService'
import { useHrStore } from './hrStore'
import { useSettingsStore } from './settingsStore'
import {
  applyFinanceRejection,
  applyFinanceReviewMark,
  applyFinanceVerification,
  applyFinanceResubmission,
  canResubmitOrderFinance,
  applyUnlockedEditFinalization,
  canMakeOrderFinanceDecision,
} from '../domain/orderBusinessRules'
import { finalizeOrderMutation, validateOrderCommand } from './orderCommandSupport'
import { useFinanceStore } from './financeStore'

type FinanceActions = Pick<
  OrdersStoreState,
  | 'finalizeUnlockedEdit'
  | 'verifyOrderFinance'
  | 'rejectOrderFinance'
  | 'markOrderForFinanceReview'
  | 'resubmitOrderFinance'
>

export const createOrderFinanceActions = (
  set: OrdersStoreSet,
  get: () => OrdersStoreState,
): FinanceActions => ({
  finalizeUnlockedEdit: ({ orderNumber, expectedRevision, actor }) => {
    const target = get().orders.find((order) => order.orderNumber === orderNumber)
    const denied = validateOrderCommand({
      order: target,
      actor,
      expectedRevision,
      kind: 'details',
      permissions: useSettingsStore.getState().permissions,
      action: 'order.edit_unlock.finalize',
    })
    if (denied) return denied
    if (!target!.editUnlocked) {
      return { allowed: false, code: 'NO_CHANGE', reason: 'This order is not unlocked.' }
    }

    const wasVerified = Boolean(target!.financeVerified)
    const updatedOrder = finalizeOrderMutation({
      before: target!,
      after: applyUnlockedEditFinalization(target!),
      actor,
      action: 'order.edit_unlock.finalize',
    })
    set((state) => ({
      orders: state.orders.map((order) =>
        order.orderNumber === orderNumber ? updatedOrder : order,
      ),
    }))

    if (wasVerified) {
      emitOrderUpdated(
        updatedOrder,
        'Revised after edit approval — sent back for Finance re-verification',
      )
    }
    return { allowed: true, order: updatedOrder }
  },

  verifyOrderFinance: ({ orderNumber, expectedRevision, actor }) => {
    const target = get().orders.find((order) => order.orderNumber === orderNumber)
    const denied = validateOrderCommand({
      order: target,
      actor,
      expectedRevision,
      kind: 'finance_decision',
      permissions: useSettingsStore.getState().permissions,
      action: 'order.finance.verify',
    })
    if (denied) return denied
    const decision = canMakeOrderFinanceDecision({
      order: target!,
      role: actor.role,
      decision: 'verify',
      capabilityAllowed: isActionAuthorized(actor.role, 'finance.verify_order'),
    })
    if (!decision.allowed) {
      return { allowed: false, code: 'INVALID_INPUT', reason: decision.reason }
    }

    const updatedOrder = finalizeOrderMutation({
      before: target!,
      after: applyFinanceVerification(target!, actor.name, new Date().toISOString()),
      actor,
      action: 'order.finance.verify',
    })
    set((state) => ({
      orders: state.orders.map((order) =>
        order.orderNumber === orderNumber ? updatedOrder : order,
      ),
    }))
    useFinanceStore.getState().verifyOrderTransactions({
      orderNumber,
      actor: { name: actor.name, role: actor.role },
      completedAt: updatedOrder.completedAt,
    })
    emitOrderUpdated(updatedOrder, `Verified by Finance · ${actor.name}`)
    useHrStore.getState().syncOrderContributionPoints({
      orders: get().orders,
      actor: { name: actor.name, role: actor.role },
    })
    return { allowed: true, order: updatedOrder }
  },

  rejectOrderFinance: ({ orderNumber, expectedRevision, actor, note }) => {
    const target = get().orders.find((order) => order.orderNumber === orderNumber)
    const denied = validateOrderCommand({
      order: target,
      actor,
      expectedRevision,
      kind: 'finance_decision',
      permissions: useSettingsStore.getState().permissions,
      action: 'order.finance.reject',
    })
    if (denied) return denied
    const decision = canMakeOrderFinanceDecision({
      order: target!,
      role: actor.role,
      decision: 'reject',
      note,
      capabilityAllowed: isActionAuthorized(actor.role, 'finance.verify_order'),
    })
    if (!decision.allowed) {
      return { allowed: false, code: 'INVALID_INPUT', reason: decision.reason }
    }

    const updatedOrder = finalizeOrderMutation({
      before: target!,
      after: applyFinanceRejection(target!, actor.name, note, new Date().toISOString()),
      actor,
      action: 'order.finance.reject',
      reason: note,
    })
    set((state) => ({
      orders: state.orders.map((order) =>
        order.orderNumber === orderNumber ? updatedOrder : order,
      ),
    }))
    emitOrderUpdated(
      updatedOrder,
      `Rejected by Finance · ${actor.name}${note ? `: ${note}` : ''}`,
    )
    return { allowed: true, order: updatedOrder }
  },

  markOrderForFinanceReview: ({ orderNumber, expectedRevision, actor, note }) => {
    const target = get().orders.find((order) => order.orderNumber === orderNumber)
    const denied = validateOrderCommand({
      order: target,
      actor,
      expectedRevision,
      kind: 'finance_decision',
      permissions: useSettingsStore.getState().permissions,
      action: 'order.finance.review',
    })
    if (denied) return denied
    const decision = canMakeOrderFinanceDecision({
      order: target!,
      role: actor.role,
      decision: 'review',
      note,
      capabilityAllowed: isActionAuthorized(actor.role, 'finance.verify_order'),
    })
    if (!decision.allowed) {
      return { allowed: false, code: 'INVALID_INPUT', reason: decision.reason }
    }

    const updatedOrder = finalizeOrderMutation({
      before: target!,
      after: applyFinanceReviewMark(target!, actor.name, note, new Date().toISOString()),
      actor,
      action: 'order.finance.review',
      reason: note,
    })
    set((state) => ({
      orders: state.orders.map((order) =>
        order.orderNumber === orderNumber ? updatedOrder : order,
      ),
    }))
    emitOrderUpdated(
      updatedOrder,
      `Marked for review by Finance · ${actor.name}${note ? `: ${note}` : ''}`,
    )
    return { allowed: true, order: updatedOrder }
  },

  resubmitOrderFinance: ({ orderNumber, expectedRevision, actor, note }) => {
    const target = get().orders.find((order) => order.orderNumber === orderNumber)
    const denied = validateOrderCommand({
      order: target,
      actor,
      expectedRevision,
      kind: 'finance_resubmit',
      permissions: useSettingsStore.getState().permissions,
      action: 'order.finance.resubmit',
    })
    if (denied) return denied
    const decision = canResubmitOrderFinance({ order: target, role: actor.role, note })
    if (!decision.allowed) {
      return { allowed: false, code: 'INVALID_INPUT', reason: decision.reason }
    }
    const updatedOrder = finalizeOrderMutation({
      before: target!,
      after: applyFinanceResubmission(target!, actor.name, note!, new Date().toISOString()),
      actor,
      action: 'order.finance.resubmit',
      reason: note,
      metadata: { rejectedRevision: target!.revision },
    })
    set((state) => ({
      orders: state.orders.map((order) =>
        order.orderNumber === orderNumber ? updatedOrder : order,
      ),
    }))
    emitOrderUpdated(updatedOrder, `Corrected and resubmitted to Finance · ${actor.name}`)
    return { allowed: true, order: updatedOrder }
  },
})
