/**
 * @file revenueDateDomain.ts
 * @description Date parsing and window/anchor utilities shared by every
 * order-date aggregation for the Dashboard Today summary. Verified-cash Revenue analytics live in `cashRevenueDomain.ts`.
 * Kept separate because these are generic "which orders fall in which time
 * window" helpers, distinct from the money math itself.
 */

import type { BranchId, OrderTableRow } from '../types/orders'

/** @description Maps Indonesian/English short month labels to a 0-based month index. */
const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  mei: 4,
  may: 4,
  jun: 5,
  jul: 6,
  agu: 7,
  ags: 7,
  aug: 7,
  sep: 8,
  okt: 9,
  oct: 9,
  nov: 10,
  des: 11,
  dec: 11,
}

/**
 * @description Parses the human-friendly `createdAtLabel` (e.g. "12 Apr 2026 · 10:15"
 * or "03 Jul 2026 · 09.10") into a real Date. Returns null if the label can't
 * be parsed, so callers can safely skip malformed rows.
 */
export const parseOrderDate = (label: string | undefined | null): Date | null => {
  if (!label) return null

  const [datePartRaw, timePartRaw] = label.split('·').map((part) => part.trim())
  if (!datePartRaw) return null

  const tokens = datePartRaw.split(/\s+/)
  if (tokens.length < 3) return null

  const [dayStr, monthStr, yearStr] = tokens
  const month = MONTH_INDEX[monthStr.toLowerCase()]
  const day = Number.parseInt(dayStr, 10)
  const year = Number.parseInt(yearStr, 10)

  if (month === undefined || Number.isNaN(day) || Number.isNaN(year)) return null

  let hour = 0
  let minute = 0

  if (timePartRaw) {
    const normalized = timePartRaw.replace('.', ':')
    const [hourStr, minuteStr] = normalized.split(':')
    hour = Number.parseInt(hourStr, 10) || 0
    minute = Number.parseInt(minuteStr, 10) || 0
  }

  return new Date(year, month, day, hour, minute)
}

/**
 * @description Filters orders to a specific branch, or returns all orders
 * when branch is omitted / set to 'all'.
 */
export const filterOrdersByBranch = (
  orders: OrderTableRow[],
  branch?: BranchId | 'all',
): OrderTableRow[] => {
  if (!branch || branch === 'all') return orders
  return orders.filter((order) => order.branch === branch)
}

/**
 * @description Resolves an "anchor now" for date-window calculations.
 * Demo data is seeded around fixed dates rather than the real device clock,
 * so trends stay meaningful regardless of when the app is actually opened:
 * we anchor on the most recent parsable order date, falling back to the
 * real current time if no dates parse.
 */
export const getAnchorNow = (orders: OrderTableRow[]): Date => {
  let latest: Date | null = null
  orders.forEach((order) => {
    const parsed = parseOrderDate(order.createdAtLabel)
    if (parsed && (!latest || parsed > latest)) {
      latest = parsed
    }
  })
  return latest ?? new Date()
}
