/**
 * @file useBranchOrders.ts
 * @description Single source of truth for "what orders belong to this branch
 * right now". Reads live from ordersStore (the only place Orders data is
 * seeded from), then scopes to a branch.
 *
 * This exists so that every screen reading order data (Orders tab header
 * chips, OrdersTableView, dashboard widgets) derives from the same list and
 * can't drift apart — see brief sections 1.1–1.3.
 */

import { useMemo } from 'react'
import { useOrdersStore } from '../store/ordersStore'
import { getOrderPriority } from '../domain/ordersDomain'
import { countActiveFutureOrders } from '../domain/futureOrderBadgeDomain'
import type { BranchFilter, OrderTableRow } from '../types/orders'

/**
 * @description Statuses that make up the "Active" scope (mirrors
 * filterOrdersByScope in OrdersTableView).
 */
const ACTIVE_ORDER_STATUSES = new Set([
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'delivering',
])

/**
 * @description Statuses that make up the "Completed" scope.
 */
const COMPLETED_STATUSES = new Set([
  'delivered',
  'picked_up',
  'cancelled',
  'failed',
])

/**
 * @description Returns the de-duplicated, authoritative persisted list of all orders
 * for a given branch (no scope/status/search filtering applied).
 */
export const useBranchOrders = (branch: BranchFilter): OrderTableRow[] => {
  const localOrders = useOrdersStore((state) => state.orders)
  return useMemo(() => {
    return localOrders.filter(
      (order) => branch === 'All' || order.branch === branch,
    )
  }, [localOrders, branch])
}

/**
 * @description Summary counts for the Orders tab header chips, derived from
 * the exact same branch-scoped order list OrdersTableView renders — so the
 * header can never disagree with the list below it again (bug 1.2).
 *
 * "Needs attention" = pending verification + failed + late (deadline passed),
 * per the brief's explicit definition since no such logic existed before.
 */
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

/**
 * @description Count of orders scheduled for a date after today, for the
 * given branch. Used to badge the "Future" scope tab so staff can see at a
 * glance whether there's anything waiting there — independent of whichever
 * scope tab (Today/Future/Custom) happens to be active right now.
 */
export const useFutureOrderCount = (branch: BranchFilter): number => {
  const orders = useBranchOrders(branch)

  return useMemo(() => countActiveFutureOrders(orders), [orders])
}
