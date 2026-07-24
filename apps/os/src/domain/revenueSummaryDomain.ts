/**
 * @file revenueSummaryDomain.ts
 * @description Order-based Today-vs-yesterday snapshot used by Overview.
 * Verified-cash Revenue Dashboard analytics live in cashRevenueDomain.ts.
 */

import type { BranchId, OrderTableRow } from '../types/orders'
import { isRevenueEligible } from './orderFinanceMathDomain'
import { filterOrdersByBranch, getAnchorNow, parseOrderDate } from './revenueDateDomain'

/** @description Today-vs-yesterday summary used by the main Dashboard overview cards. */
export interface TodaySummary {
  ordersToday: number
  ordersYesterday: number
  ordersDeltaVsYesterday: number
  revenueTodayIdr: number
  revenueYesterdayIdr: number
  revenueGrowthPercent: number | null
}

/**
 * @description Computes "today" vs "yesterday" order count and revenue,
 * anchored on the most recent order date (see getAnchorNow) so the demo
 * stays meaningful regardless of the real device clock.
 */
export const getTodaySummary = (
  orders: OrderTableRow[],
  options?: { branch?: BranchId | 'all' },
): TodaySummary => {
  const scoped = filterOrdersByBranch(orders, options?.branch)
  const anchorNow = getAnchorNow(orders)

  const todayStart = new Date(anchorNow)
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(todayStart)
  todayEnd.setDate(todayEnd.getDate() + 1)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  let ordersToday = 0
  let ordersYesterday = 0
  let revenueTodayIdr = 0
  let revenueYesterdayIdr = 0

  scoped.forEach((order) => {
    const date = parseOrderDate(order.createdAtLabel)
    if (!date) return

    const inToday = date >= todayStart && date < todayEnd
    const inYesterday = date >= yesterdayStart && date < todayStart

    if (inToday) {
      ordersToday += 1
      if (isRevenueEligible(order)) revenueTodayIdr += order.totalIdr
    } else if (inYesterday) {
      ordersYesterday += 1
      if (isRevenueEligible(order)) revenueYesterdayIdr += order.totalIdr
    }
  })

  const revenueGrowthPercent =
    revenueYesterdayIdr > 0
      ? ((revenueTodayIdr - revenueYesterdayIdr) / revenueYesterdayIdr) * 100
      : null

  return {
    ordersToday,
    ordersYesterday,
    ordersDeltaVsYesterday: ordersToday - ordersYesterday,
    revenueTodayIdr,
    revenueYesterdayIdr,
    revenueGrowthPercent,
  }
}
