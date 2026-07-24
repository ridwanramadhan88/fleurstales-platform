/**
 * @file stockTransferDomain.ts
 * @description Pure business rules for the stock-transfer lifecycle.
 * Keeping the state machine outside the Zustand writer lets the store, tests,
 * and future backend/API layer share one authoritative transition rule.
 */

import type { StockTransferStatus } from '../store/stockStoreTypes'

/**
 * @description Legal next states for each stock-transfer status.
 * `received` and `cancelled` are terminal and therefore have no next states.
 */
const STOCK_TRANSFER_TRANSITIONS: Readonly<
  Record<StockTransferStatus, readonly StockTransferStatus[]>
> = {
  requested: ['in_transit', 'cancelled'],
  in_transit: ['received', 'cancelled'],
  received: [],
  cancelled: [],
}

/**
 * @description Returns whether a stock transfer may move from `from` to `to`.
 * Same-state retries are intentionally rejected here; the store treats every
 * rejected transition as a no-op, which protects one-time quantity effects.
 */
export const canTransitionStockTransferStatus = (
  from: StockTransferStatus,
  to: StockTransferStatus,
): boolean => STOCK_TRANSFER_TRANSITIONS[from].includes(to)

