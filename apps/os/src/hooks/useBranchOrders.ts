/**
 * @file useBranchOrders.ts
 * @description Single source of truth for "what orders belong to this branch
 * right now". Reads live from ordersStore (the only place Orders data is
 * seeded from), then scopes to a branch.
 */

import { useMemo } from 'react'
import { useOrdersStore } from '../store/ordersStore'
import { getOrderPriority } from '../domain/ordersDomain'
import { countActiveFutureOrders, getActiveFutureOrderDates } from '../domain/futureOrderBadgeDomain'
import type { BranchFilter, OrderTableRow } from '../types/orders'

const ACTIVE_ORDER_STATUSES = new Set([
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'delivering',
])

const COMPLETED_STATUSES = new Set([
  'delivered',
  'picked_up',
  'cancelled',
  'failed',
])

export const useBranchOrders = (branch: BranchFilter): OrderTableRow[] => {
  const localOrders = useOrdersStore((state) => state.orders)
  return useMemo(() => {
    return localOrders.filter(
      (order) => branch === 'All' || order.branch === branch,
    )
  }, [localOrders, branch])
}

export interface BranchOrderCounts {
  active: number
  completed: number
  needsAttention: number
}

export const useBranchOrderCounts = (branch: BranchFilter): BranchOrderCounts => {
  const orders = useBranchOrders(branch)

  return useMemo(() => {
    let active = 0
    let completed = 0
    let needsAttention = 0

    orders.forEach((order) => {
      if (ACTIVE_ORDER_STATUSES.has(order.status)) active += 1
      if (COMPLETED_STATUSES.has(order.status)) completed += 1

      const isLate = getOrderPriority(order) === 'late'
      if (
        order.status === 'pending_verification' ||
        order.status === 'failed' ||
        isLate
      ) {
        needsAttention += 1
      }
    })

    return { active, completed, needsAttention }
  }, [orders])
}

/** Exact future fulfillment count, including later-today orders. */
export const useFutureOrderCount = (branch: BranchFilter): number => {
  const orders = useBranchOrders(branch)
  return useMemo(() => countActiveFutureOrders(orders), [orders])
}

/** Dates that contain at least one active future fulfillment, for calendar dots. */
export const useFutureOrderDates = (branch: BranchFilter): string[] => {
  const orders = useBranchOrders(branch)
  return useMemo(() => getActiveFutureOrderDates(orders), [orders])
}
