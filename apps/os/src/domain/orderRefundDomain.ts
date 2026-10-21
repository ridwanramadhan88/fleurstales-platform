import type { OrderTableRow } from '../types/orders'
import type { UserRole } from '../store/userStore'
import { isActionAuthorized } from '../config/authorization'

export type NormalPaymentStatus = 'unpaid' | 'partial' | 'paid'
export type RefundActor = { name: string; role: UserRole }

export type RefundResult =
  | { allowed: true; order: OrderTableRow }
  | { allowed: false; reason: string }

/**
 * Finance (via `finance.approve_refund`) and Owner may start a refund.
 * Withdrawing or completing it — money leaving an account — stays with Finance;
 * the server enforces completion in `complete_order_refund_with_account`.
 */
export const canInitiateOrderRefund = (role: UserRole): boolean =>
  role === 'owner' || isActionAuthorized(role, 'finance.approve_refund')

export const canCompleteOrderRefund = (role: UserRole): boolean =>
  role !== 'owner' && isActionAuthorized(role, 'finance.approve_refund')

/** Withdrawing a pending refund back to Paid stays with Finance. */
export const canCancelOrderRefund = (role: UserRole): boolean =>
  role !== 'owner' && isActionAuthorized(role, 'finance.approve_refund')

/** A paid order that is cancelled must have its refund started in the same save. */
export const cancellationRequiresRefund = (order: Pick<OrderTableRow, 'paymentStatus' | 'paidAmountIdr'>): boolean =>
  order.paymentStatus === 'paid' && (order.paidAmountIdr ?? 0) > 0

/**
 * Marks a paid order that is being cancelled as `refund_pending`. Permission is
 * the cancellation's (Owner/Admin/Finance); the server only accepts this shape
 * together with the status change to `cancelled`.
 */
export const queueRefundForCancellation = ({
  order,
  actor,
  reason,
  initiatedAt,
}: {
  order: OrderTableRow
  actor: RefundActor
  reason: string
  initiatedAt: string
}): OrderTableRow => ({
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
})

const refundPermissionMessage = 'You do not have permission to manage refunds.'

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
  if (!canInitiateOrderRefund(actor.role)) return { allowed: false, reason: refundPermissionMessage }
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
  if (!canCompleteOrderRefund(actor.role)) return { allowed: false, reason: refundPermissionMessage }
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
  if (!canCancelOrderRefund(actor.role)) return { allowed: false, reason: refundPermissionMessage }
  if (order.paymentStatus !== 'refund_pending') return { allowed: false, reason: 'Only a pending refund can be cancelled.' }
  if (order.status === 'cancelled') return { allowed: false, reason: 'A cancelled order must be refunded.' }
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
