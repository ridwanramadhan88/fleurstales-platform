/**
 * Shared order-state eligibility rules.
 * Revenue Dashboard accounting lives in cashRevenueDomain.ts.
 */
import type { OrderStatus, OrderTableRow, PaymentStatus } from '../types/orders'

const VOIDED_REVENUE_STATUSES: OrderStatus[] = ['cancelled', 'failed']
const REFUND_PAYMENT_STATUSES: PaymentStatus[] = ['refund_pending', 'refunded']

export type RevenueConfidence = 'confirmed' | 'pending'

export const isVoidedRevenueOrder = (order: OrderTableRow): boolean =>
  VOIDED_REVENUE_STATUSES.includes(order.status)

export const isRefundOrder = (order: OrderTableRow): boolean =>
  REFUND_PAYMENT_STATUSES.includes(order.paymentStatus)

export const isRevenueEligible = (order: OrderTableRow): boolean =>
  !isVoidedRevenueOrder(order)

export const getRevenueConfidence = (order: OrderTableRow): RevenueConfidence =>
  order.financeVerified ? 'confirmed' : 'pending'
