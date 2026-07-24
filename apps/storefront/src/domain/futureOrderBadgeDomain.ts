import type { OrderTableRow } from '../types/orders'
import { isFutureOrder } from './orderTimingDomain'

const ACTIVE_FUTURE_BADGE_STATUSES = new Set<OrderTableRow['status']>([
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'delivering',
])

export const countActiveFutureOrders = (orders: OrderTableRow[]): number =>
  orders.filter(
    (order) => isFutureOrder(order) && ACTIVE_FUTURE_BADGE_STATUSES.has(order.status),
  ).length
