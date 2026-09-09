import type { OrderStatus, OrderTableRow } from '../../types/orders'
import { getDisplayScheduleLabel } from './orderTableFormatters'
import { getQuickActionLabel } from './orderStatusBadgeStyles'

export interface OrderFinancePresentation {
  paidAmountIdr: number
  differenceIdr: number
  paymentMismatch: boolean
  missingRequiredProof: boolean
  needsAttention: boolean
  resolved: boolean
  attentionReason?: string
}

export const getOrderFinancePresentation = (order: OrderTableRow): OrderFinancePresentation => {
  const paidAmountIdr = order.paidAmountIdr ?? (order.paymentStatus === 'paid' ? order.totalIdr : 0)
  const differenceIdr = order.totalIdr - paidAmountIdr
  const paymentMismatch =
    (order.paymentStatus === 'paid' && paidAmountIdr !== order.totalIdr) ||
    (order.paymentStatus === 'partial' && (paidAmountIdr <= 0 || paidAmountIdr >= order.totalIdr)) ||
    (order.paymentStatus === 'unpaid' && paidAmountIdr > 0)
  const missingRequiredProof = order.paymentMethod === 'transfer' && order.paymentStatus === 'paid' && !order.paymentProofUrl
  const rejected = order.financeVerificationStatus === 'rejected'
  const markedForReview = order.financeVerificationStatus === 'review'
  const needsAttention = paymentMismatch || missingRequiredProof || rejected || markedForReview
  const resolved = Boolean(order.financeVerified)

  let attentionReason: string | undefined
  if (rejected) attentionReason = order.financeVerificationNote || 'Finance returned this payment for correction.'
  else if (paymentMismatch) attentionReason = 'The recorded paid amount does not match the order total.'
  else if (missingRequiredProof) attentionReason = 'Transfer payment is marked paid but no private proof is attached.'
  else if (markedForReview) attentionReason = order.financeVerificationNote || 'Finance marked this payment for closer review.'

  return { paidAmountIdr, differenceIdr, paymentMismatch, missingRequiredProof, needsAttention, resolved, attentionReason }
}

export interface OrderCurrentFocus {
  eyebrow: string
  title: string
  description: string
  nextAction?: string
  schedule?: string
}

const focusByStatus: Record<OrderStatus, Omit<OrderCurrentFocus, 'nextAction' | 'schedule'>> = {
  pending_verification: {
    eyebrow: 'Current focus',
    title: 'Confirm this order before production starts',
    description: 'Check the customer request, schedule, and payment readiness. Resolve anything blocking acceptance first.',
  },
  confirmed: {
    eyebrow: 'Current focus',
    title: 'Assign production ownership',
    description: 'Payment is confirmed. Make sure a florist is assigned and production can start on schedule.',
  },
  processing: {
    eyebrow: 'Current focus',
    title: 'Complete production',
    description: 'Keep the florist, production notes, and fulfillment deadline in view. A finished photo is required before Ready.',
  },
  ready: {
    eyebrow: 'Current focus',
    title: 'Hand off the finished order',
    description: 'The product is ready. Focus on pickup or delivery details and the next fulfillment handoff.',
  },
  delivering: {
    eyebrow: 'Current focus',
    title: 'Complete delivery',
    description: 'Keep destination, customer contact, and delivery timing visible until the handoff is complete.',
  },
  delivered: {
    eyebrow: 'Completed',
    title: 'Order delivered',
    description: 'The operational workflow is complete. Keep the final result and customer review as reference.',
  },
  picked_up: {
    eyebrow: 'Completed',
    title: 'Order picked up',
    description: 'The operational workflow is complete. Keep the final result and customer review as reference.',
  },
  cancelled: {
    eyebrow: 'Closed',
    title: 'Order cancelled',
    description: 'No operational action is required. Review the cancellation reason and history if needed.',
  },
  failed: {
    eyebrow: 'Needs attention',
    title: 'Order requires manual follow-up',
    description: 'Review the activity history and resolve the issue before taking any further action.',
  },
}

export const getOrderCurrentFocus = (order: OrderTableRow, nextStatus: OrderStatus | null): OrderCurrentFocus => ({
  ...focusByStatus[order.status],
  nextAction: nextStatus ? getQuickActionLabel(nextStatus) : undefined,
  schedule: getDisplayScheduleLabel(order) ?? undefined,
})
