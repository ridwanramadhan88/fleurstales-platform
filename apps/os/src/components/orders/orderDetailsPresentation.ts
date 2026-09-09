import type { OrderStatus, OrderTableRow } from '../../types/orders'
import { getDisplayScheduleLabel } from './orderTableFormatters'

export interface OperationalFocus {
  eyebrow: string
  title: string
  description: string
  facts: Array<{ label: string; value: string }>
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'destructive'
}

export interface FinancePresentation {
  state: 'attention' | 'resolved' | 'reference'
  reasons: string[]
  paidAmount: number
  remainingBalance: number
  paymentMismatch: boolean
  missingRequiredProof: boolean
}

const formatIdr = (value: number): string =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)

export const getOperationalFocus = (order: OrderTableRow): OperationalFocus => {
  const schedule = getDisplayScheduleLabel(order) ?? 'Schedule not set'
  const fulfillment = order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'
  const baseFacts = [
    { label: 'Schedule', value: schedule },
    { label: 'Fulfillment', value: fulfillment },
  ]

  const focusByStatus: Record<OrderStatus, OperationalFocus> = {
    pending_verification: {
      eyebrow: 'Current focus',
      title: 'Verify and accept this order',
      description: 'Check payment readiness, requested schedule, and customer order details before production starts.',
      facts: [
        { label: 'Payment', value: order.paymentStatus === 'paid' ? 'Paid' : 'Needs confirmation' },
        { label: 'Order total', value: formatIdr(order.totalIdr) },
        ...baseFacts,
      ],
      tone: order.paymentStatus === 'paid' ? 'info' : 'warning',
    },
    confirmed: {
      eyebrow: 'Current focus',
      title: 'Prepare production',
      description: order.florist
        ? 'The order is confirmed. Review the schedule and move it into production when the florist is ready.'
        : 'Assign a florist and move the confirmed order into production.',
      facts: [
        { label: 'Florist', value: order.florist ?? 'Not assigned' },
        { label: 'Payment', value: 'Confirmed' },
        ...baseFacts,
      ],
      tone: 'info',
    },
    processing: {
      eyebrow: 'Current focus',
      title: 'Complete production',
      description: 'Keep execution details visible. The finished photo is required before this order can move to Ready.',
      facts: [
        { label: 'Florist', value: order.florist ?? 'Not assigned' },
        { label: 'Finished photo', value: order.finishPhotoUrl ? 'Uploaded' : 'Required' },
        ...baseFacts,
      ],
      tone: order.finishPhotoUrl ? 'success' : 'info',
    },
    ready: {
      eyebrow: 'Current focus',
      title: order.fulfillment === 'delivery' ? 'Hand off for delivery' : 'Prepare customer pickup',
      description: order.fulfillment === 'delivery'
        ? 'The flowers are ready. Keep the finished photo and delivery details in focus for handoff.'
        : 'The flowers are ready. Keep the pickup schedule and finished photo in focus.',
      facts: [
        { label: 'Finished photo', value: order.finishPhotoUrl ? 'Ready' : 'Missing' },
        ...baseFacts,
      ],
      tone: 'success',
    },
    delivering: {
      eyebrow: 'Current focus',
      title: 'Complete delivery',
      description: 'Use the destination, customer contact, schedule, and finished product photo to complete the handoff.',
      facts: [
        { label: 'Destination', value: order.deliveryAddress ?? 'Not recorded' },
        ...baseFacts,
      ],
      tone: 'success',
    },
    delivered: {
      eyebrow: 'Completed',
      title: 'Order delivered',
      description: 'Operational work is complete. Keep the final outcome, payment state, and customer review as reference.',
      facts: [
        { label: 'Payment', value: order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus },
        { label: 'Completed', value: order.completedAt ?? 'Recorded' },
      ],
      tone: 'success',
    },
    picked_up: {
      eyebrow: 'Completed',
      title: 'Order picked up',
      description: 'Operational work is complete. Keep the final outcome, payment state, and customer review as reference.',
      facts: [
        { label: 'Payment', value: order.paymentStatus === 'paid' ? 'Paid' : order.paymentStatus },
        { label: 'Completed', value: order.completedAt ?? order.actualPickedUpAt ?? 'Recorded' },
      ],
      tone: 'success',
    },
    cancelled: {
      eyebrow: 'Closed',
      title: 'Order cancelled',
      description: 'No operational action is required. Review the cancellation reason and financial state only when needed.',
      facts: [{ label: 'Reason', value: order.cancellationReason ?? 'Not recorded' }],
      tone: 'destructive',
    },
    failed: {
      eyebrow: 'Needs attention',
      title: 'Order requires manual review',
      description: 'Resolve the failed order outside the normal happy-path workflow before taking another lifecycle action.',
      facts: baseFacts,
      tone: 'destructive',
    },
  }

  return focusByStatus[order.status]
}

export const getFinancePresentation = (order: OrderTableRow): FinancePresentation => {
  const paidAmount = order.paidAmountIdr ?? (order.paymentStatus === 'paid' ? order.totalIdr : 0)
  const remainingBalance = Math.max(0, order.totalIdr - paidAmount)
  const paymentMismatch =
    (order.paymentStatus === 'paid' && paidAmount !== order.totalIdr) ||
    (order.paymentStatus === 'partial' && (paidAmount <= 0 || paidAmount >= order.totalIdr)) ||
    (order.paymentStatus === 'unpaid' && paidAmount > 0)
  const missingRequiredProof =
    order.paymentMethod === 'transfer' &&
    order.paymentStatus === 'paid' &&
    !order.paymentProofUrl

  const reasons: string[] = []
  if (order.financeVerificationStatus === 'rejected') {
    reasons.push(order.financeVerificationNote || 'Finance rejected this payment and requested a correction.')
  }
  if (order.financeVerificationStatus === 'review') {
    reasons.push(order.financeVerificationNote || 'Finance marked this payment for further review.')
  }
  if (paymentMismatch) reasons.push('Payment status and recorded amount do not match.')
  if (missingRequiredProof) reasons.push('Bukti transfer is missing for this paid transfer.')

  return {
    state: reasons.length > 0 ? 'attention' : order.financeVerified ? 'resolved' : 'reference',
    reasons,
    paidAmount,
    remainingBalance,
    paymentMismatch,
    missingRequiredProof,
  }
}
