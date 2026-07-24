/**
 * @file orderTableFormatters.ts
 * @description Orders-table-specific formatting and business rules that
 * don't belong in the shared domain layer. Date/time math and urgency now
 * live in `../../domain/orderTimingDomain`, and scheduled-time/completion display-label
 * formatting lives in `./orderTableScheduleLabels` — both are re-exported here so
 * existing imports of this file keep working unchanged.
 */

import type { OrderTableRow } from '../../types/orders'
import { STATUS_GROUP_FROM_STATUS } from './orderStatusLabels'
import { getOrderUrgency as getDomainOrderUrgency, nowInJakarta } from '../../domain/orderTimingDomain'
import { getCreatedAtTimestamp } from './orderTableScheduleLabels'

/**
 * @description Whether an order's unpaid status is actually worth flagging.
 * Unpaid is the normal, default state for a brand-new order still awaiting
 * verification — that's not a problem. It only becomes one once the order
 * has been processed (moved past the "new" group) *and* has stayed unpaid
 * for a meaningful stretch of time (5+ hours) since it was created. Before
 * that threshold, it's still just normal in-progress bookkeeping and
 * shouldn't compete for attention with orders that are genuinely late.
 */
export const isPaymentOverdue = (order: OrderTableRow): boolean => {
  if (order.paymentStatus !== 'unpaid') return false
  if (STATUS_GROUP_FROM_STATUS[order.status] === 'new') return false

  const createdAtMs = getCreatedAtTimestamp(order.createdAtLabel)
  if (!createdAtMs) return false

  const hoursSinceCreated = (nowInJakarta().getTime() - createdAtMs) / (1000 * 60 * 60)
  return hoursSinceCreated >= 5
}

export const getOrderUrgency = getDomainOrderUrgency

// Re-exported for backward compatibility with existing imports of this file.
export {
  toJakarta,
  nowInJakarta,
  getLocalDateString,
  addDays,
  parseOrderDateString,
  getOrderTimeString,
  getOrderDateTime,
  isFutureOrder,
  getScheduleDateFromLabel,
  wasCompletedLate,
  getRequestedPickupLabel,
  getActualPickupLabel,
} from '../../domain/orderTimingDomain'

export {
  getCreatedAtTimestamp,
  getOrderDisplayLabel,
  formatCompletionLabel,
  formatOrderScheduleLabel,
  getDisplayScheduleLabel,
} from './orderTableScheduleLabels'

/**
 * @description Formats a numeric-like string into IDR-style text (e.g. 350000 → "350.000").
 * Re-exported here (under its original name) from the shared formatters
 * module, so existing imports from this file keep working — the actual
 * implementation now lives in `lib/formatters.ts` alongside
 * `sanitizeCurrency`/`normalizePhone`, since it was previously duplicated
 * verbatim in NewOrderSheet.tsx under a different name.
 */
export { formatIdrInput as formatIdrText } from '../../lib/formatters'
