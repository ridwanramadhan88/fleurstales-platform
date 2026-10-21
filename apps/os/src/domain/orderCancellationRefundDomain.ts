/**
 * @file orderCancellationRefundDomain.ts
 * @description Cancelling a paid order starts its refund in the same save
 * (server rule PAID_ORDER_CANCELLATION_REQUIRES_REFUND). Finance completes the
 * refund from the refund queue with the account the money leaves from.
 */
import type { OrderPaymentEvent, OrderTableRow } from '../types/orders'
import { appendPaymentEvent, buildOrderPaymentEvent } from './orderPaymentDomain'
import { queueRefundForCancellation } from './orderRefundDomain'

export const CANCELLATION_REFUND_REASON = 'Order cancelled after payment.'

export const queueCancellationRefund = (
  order: OrderTableRow,
  before: OrderTableRow,
  actor: Parameters<typeof buildOrderPaymentEvent>[0]['actor'],
  expectedRevision: number,
): OrderTableRow => {
  const initiatedAt = new Date().toISOString()
  const queued = queueRefundForCancellation({ order, actor, reason: CANCELLATION_REFUND_REASON, initiatedAt })
  const refundEvent: OrderPaymentEvent = {
    ...buildOrderPaymentEvent({
      order: before,
      resultingStatus: 'refund_pending',
      resultingPaidAmountIdr: before.paidAmountIdr ?? 0,
      actor,
      occurredAt: initiatedAt,
      method: before.paymentMethod,
      note: CANCELLATION_REFUND_REASON,
      idempotencyKey: `${before.id ?? before.orderNumber}:cancel-refund:${expectedRevision}`,
    }),
    type: 'refund_initiated',
    amountIdr: queued.refundAmountIdr ?? before.paidAmountIdr ?? 0,
  }
  return appendPaymentEvent(queued, refundEvent)
}

