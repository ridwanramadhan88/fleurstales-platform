import type { OrderFulfillment, OrderStatus, OrderTableRow, PaymentMethod } from '../types/orders'

const OUTSTANDING_PAYMENT_STATUSES = ['unpaid', 'partial'] as const
const PAYMENT_GATED_TARGETS: OrderStatus[] = ['delivering', 'picked_up']

/**
 * @description Single source of truth for "cash is not a valid payment
 * method for delivery orders" (bank transfer only). Previously implemented
 * three times independently — the internal New Order sheet's disabled
 * `<Select>` option, `validateNewOrderForm`'s explicit check, and a
 * hand-written condition in the storefront's `CartDrawerReviewStep.tsx`
 * (gap-log §21). All three now call this instead of restating the rule.
 */
export const isCashAllowedForFulfillment = (fulfillment: OrderFulfillment): boolean =>
  fulfillment !== 'delivery'

export const isPaymentMethodAllowedForFulfillment = (
  paymentMethod: PaymentMethod,
  fulfillment: OrderFulfillment,
): boolean => paymentMethod !== 'cash' || isCashAllowedForFulfillment(fulfillment)

const hasOutstandingOrderPayment = (
  order: Pick<OrderTableRow, 'paymentStatus'>,
): boolean =>
  OUTSTANDING_PAYMENT_STATUSES.includes(
    order.paymentStatus as (typeof OUTSTANDING_PAYMENT_STATUSES)[number],
  )


/**
 * True whenever an order still has an outstanding (unpaid/partial) balance,
 * regardless of payment method or the order's current status. Used to badge
 * the payment status orange across every stage of the order pipeline, not
 * just when the order is "ready".
 */
export const shouldHighlightReadyPayment = (
  order: Pick<OrderTableRow, 'status' | 'paymentStatus' | 'paymentMethod'>,
): boolean => hasOutstandingOrderPayment(order)

export const shouldGateOrderAdvanceForPayment = (
  order: Pick<OrderTableRow, 'status' | 'paymentStatus' | 'paymentMethod'>,
  nextStatus: OrderStatus,
): boolean =>
  hasOutstandingOrderPayment(order) &&
  PAYMENT_GATED_TARGETS.includes(nextStatus)

export const getRemainingOrderPaymentIdr = (
  order: Pick<OrderTableRow, 'totalIdr' | 'paymentStatus' | 'paidAmountIdr'>,
): number => {
  if (!hasOutstandingOrderPayment(order)) return 0
  const paidAmount = order.paymentStatus === 'partial' ? order.paidAmountIdr ?? 0 : 0
  return Math.max(0, order.totalIdr - paidAmount)
}
