/**
 * @file orderTableScheduleLabels.ts
 * @description Display-string formatting for an order's schedule/identity in
 * the Orders table — turning raw scheduled-delivery/pickup and completion
 * fields into the "Today · 19.00" / "Tomorrow · 16.00" / "DD Mon · HH.mm"
 * labels shown to staff, plus the combined customer/product identity label.
 * The actual date-math and label-resolution logic lives in
 * `orderTimingDomain.ts` (so `alertsDomain.ts` can reuse the exact same
 * "Today"/"Tomorrow" resolution for notification messages) and is
 * re-exported here so existing imports of this file keep working unchanged.
 */

import type { OrderTableRow } from '../../types/orders'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import { resolveOrderProductDisplay } from '../../domain/catalogDomain'

/**
 * @description Attempts to parse a createdAtLabel (e.g. "12 Apr 2026 · 10:15")
 * into a timestamp for chronological sorting. Falls back to 0 (oldest) when
 * the label can't be parsed, so unparsable rows sort last in "newest first".
 */
export const getCreatedAtTimestamp = (label: string): number => {
  const cleaned = label.replace('·', '').trim()
  const parsed = new Date(cleaned)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

/**
 * @description Builds the combined "(Customer Name) - (Product Name) (Order No)"
 * label used everywhere an order needs a single, human-friendly identity
 * instead of separate Order / Customer columns.
 */
export const getOrderDisplayLabel = (
  order: OrderTableRow,
  catalogProducts: CatalogProduct[] = [],
): string => {
  const product = resolveOrderProductDisplay(catalogProducts, order).name
  return `${order.customerName} - ${product} (${order.orderNumber})`
}

// Re-exported for backward compatibility with existing imports of this file.
export {
  formatCompletionLabel,
  formatOrderScheduleLabel,
  getDisplayScheduleLabel,
} from '../../domain/orderTimingDomain'
