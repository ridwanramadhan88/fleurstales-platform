/**
 * @file orderNextActionLabels.ts
 * @description One action label per order status, shared by the admin home
 * list and the order details panel. Buttons say what the tap does
 * ("Assign & start"), never the name of the next status ("Processing →").
 */

import type { OrderTableRow } from '../../types/orders'

export const getOrderNextActionLabel = (
  order: Pick<OrderTableRow, 'status' | 'fulfillment'>,
): string => {
  if (order.status === 'pending_verification') return 'Review & confirm'
  if (order.status === 'confirmed') return 'Assign & start'
  if (order.status === 'processing') return 'Mark ready'
  if (order.status === 'ready') return order.fulfillment === 'delivery' ? 'Start delivery' : 'Complete pickup'
  if (order.status === 'delivering') return 'Mark delivered'
  return 'Open order'
}
