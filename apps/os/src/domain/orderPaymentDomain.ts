/** Pure payment-event construction and aggregate reconciliation. */
import type {
  OrderPaymentEvent,
  OrderTableRow,
  PaymentMethod,
  PaymentStatus,
} from '../types/orders'
import type { OrderActor } from './orderAuthorizationDomain'
import { generateId } from '../lib/id'

export interface BuildOrderPaymentEventInput {
  order: OrderTableRow
  resultingStatus: PaymentStatus
  resultingPaidAmountIdr: number
  actor: OrderActor
  occurredAt: string
  method?: PaymentMethod
  reference?: string
  proofId?: string
  note?: string
  idempotencyKey?: string
}

export const buildOrderPaymentEvent = ({
  order,
  resultingStatus,
  resultingPaidAmountIdr,
  actor,
  occurredAt,
  method,
  reference,
  proofId,
  note,
  idempotencyKey,
}: BuildOrderPaymentEventInput): OrderPaymentEvent => {
  const previousPaidAmountIdr = Math.max(0, order.paidAmountIdr ?? 0)
  const delta = resultingPaidAmountIdr - previousPaidAmountIdr
  const type = delta > 0
    ? 'payment_received'
    : delta < 0
      ? 'payment_reversed'
      : 'payment_status_adjusted'
  const id = generateId('payment')
  return {
    id,
    type,
    amountIdr: Math.abs(delta),
    previousPaidAmountIdr,
    resultingPaidAmountIdr,
    resultingStatus,
    method: method ?? order.paymentMethod,
    reference: reference?.trim() || undefined,
    proofId: proofId?.trim() || undefined,
    note: note?.trim() || undefined,
    actorId: actor.employeeId,
    actorName: actor.name,
    occurredAt,
    idempotencyKey: idempotencyKey?.trim() || `${order.id ?? order.orderNumber}:payment:${order.revision ?? 1}:${resultingPaidAmountIdr}:${resultingStatus}`,
  }
}

export const appendPaymentEvent = (
  order: OrderTableRow,
  event: OrderPaymentEvent,
): OrderTableRow => ({
  ...order,
  paymentStatus: event.resultingStatus,
  paymentMethod: event.method ?? order.paymentMethod,
  paidAmountIdr: event.resultingPaidAmountIdr,
  paymentHistory: [...(order.paymentHistory ?? []), event],
})
