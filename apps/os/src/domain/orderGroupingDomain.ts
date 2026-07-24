/**
 * @file orderGroupingDomain.ts
 * @description Authoritative high-level order status grouping.
 */
import type { OrderTableRow } from '../types/orders'

export type OrderStatusGroup = 'active' | 'delivery' | 'completed' | 'exception'

export const getOrderStatusGroup = (order: OrderTableRow): OrderStatusGroup => {
  switch (order.status) {
    case 'pending_verification':
    case 'confirmed':
    case 'processing':
      return 'active'
    case 'ready':
    case 'delivering':
      return 'delivery'
    case 'delivered':
    case 'picked_up':
      return 'completed'
    default:
      return 'exception'
  }
}
