import type { OrderTableRow } from '../types/orders'
import type { UserRole } from '../store/userStore'

export type NormalPaymentStatus = 'unpaid' | 'partial' | 'paid'
export type RefundActor = { name: string; role: UserRole }

export type RefundResult =
  | { allowed: true; order: OrderTableRow }
  | { allowed: false; reason: string }

export const canInitiateOrderRefund = (role: UserRole): boolean =>
  role === 'finance' || role === 'owner'

export const canCompleteOrderRefund = (role: UserRole): boolean =>
  role === 'finance'

export const canCancelOrderRefund = (role: UserRole): boolean =>
  role === 'finance' || role === 'owner'

export const initiateOrderRefund = ({
  order,
  actor,
  reason,
  initiatedAt,
}: {
  order: OrderTableRow | undefined
  actor: RefundActor
  reason: string
  initiatedAt: string
}): RefundResult => {
  if (!order) return { allowed: false, reason: 'Order not found.' }
  if (!canInitiateOrderRefund(actor.role)) return { allowed: false, reason: 'Only Finance or Owner can initiate a refund.' }
  if (!reason.trim()) return { allowed: false, reason: 'A refund reason is required.' }
  if (order.paymentStatus !== 'paid') return { allowed: false, reason: 'Only fully paid orders can enter the current full-refund workflow.' }
  if ((order.paidAmountIdr ?? 0) <= 0 || order.totalIdr <= 0) return { allowed: false, reason: 'The order has no valid paid amount to refund.' }
  return {
    allowed: true,
    order: {
      ...order,
      paymentStatus: 'refund_pending',
      refundAmountIdr: order.paidAmountIdr ?? order.totalIdr,
      refundReason: reason.trim(),
      refundInitiatedBy: actor.name,
      refundInitiatedAt: initiatedAt,
      refundCompletedBy: undefined,
      refundCompletedAt: undefined,
      refundCancelledBy: undefined,
      refundCancelledAt: undefined,
      refundCancellationReason: undefined,
    },
  }
}

export const completeOrderRefund = ({
  order,
  actor,
  completedAt,
}: {
  order: OrderTableRow | undefined
  actor: RefundActor
  completedAt: string
}): RefundResult => {
  if (!order) return { allowed: false, reason: 'Order not found.' }
  if (!canCompleteOrderRefund(actor.role)) return { allowed: false, reason: 'Only Finance can verify and complete a refund.' }
  if (order.paymentStatus !== 'refund_pending') return { allowed: false, reason: 'Only a pending refund can be completed.' }
  if (!order.refundReason || !order.refundInitiatedBy || !order.refundInitiatedAt || !(order.refundAmountIdr && order.refundAmountIdr > 0)) {
    return { allowed: false, reason: 'Refund evidence is incomplete.' }
  }
  return {
    allowed: true,
    order: {
      ...order,
      paymentStatus: 'refunded',
      paidAmountIdr: 0,
      refundCompletedBy: actor.name,
      refundCompletedAt: completedAt,
    },
  }
}


export const cancelOrderRefund = ({
  order,
  actor,
  reason,
  cancelledAt,
}: {
  order: OrderTableRow | undefined
  actor: RefundActor
  reason: string
  cancelledAt: string
}): RefundResult => {
  if (!order) return { allowed: false, reason: 'Order not found.' }
  if (!canCancelOrderRefund(actor.role)) return { allowed: false, reason: 'Only Finance or Owner can cancel a refund.' }
  if (order.paymentStatus !== 'refund_pending') return { allowed: false, reason: 'Only a pending refund can be cancelled.' }
  if (!reason.trim()) return { allowed: false, reason: 'A cancellation reason is required.' }
  return {
    allowed: true,
    order: {
      ...order,
      paymentStatus: 'paid',
      refundCancelledBy: actor.name,
      refundCancelledAt: cancelledAt,
      refundCancellationReason: reason.trim(),
    },
  }
}
