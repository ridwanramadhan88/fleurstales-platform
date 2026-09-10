import type { OrderTableRow } from '../types/orders'
import { getOrderDateTime, nowInJakarta } from './orderTimingDomain'

const ACTIVE_FUTURE_BADGE_STATUSES = new Set<OrderTableRow['status']>([
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'delivering',
])

export const isActiveFutureOrder = (order: OrderTableRow, now: Date = nowInJakarta()): boolean => {
  if (!ACTIVE_FUTURE_BADGE_STATUSES.has(order.status)) return false
  const scheduledAt = getOrderDateTime(order)
  return scheduledAt !== null && scheduledAt.getTime() > now.getTime()
}

export const countActiveFutureOrders = (orders: OrderTableRow[]): number => {
  const now = nowInJakarta()
  return orders.filter((order) => isActiveFutureOrder(order, now)).length
}

export const getActiveFutureOrderDates = (orders: OrderTableRow[]): string[] => {
  const now = nowInJakarta()
  return [...new Set(
    orders
      .filter((order) => isActiveFutureOrder(order, now))
      .map((order) => order.scheduleDate)
      .filter((value): value is string => Boolean(value)),
  )].sort()
}
