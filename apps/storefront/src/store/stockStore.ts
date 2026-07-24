/**
 * @file stockStore.ts
 * @description Raw state + wiring for the Stock store. Mirrors
 * ordersStore.ts / catalogStore.ts: this file only holds state and composes
 * actions from focused sibling modules — transfers, quantity mutations
 * (loss/write-off/sale deduction), and item CRUD each live in their own
 * stockStoreXActions.ts file. All business/derived logic (freshness,
 * operational status, filters, summaries) lives in domain/stockDomain.ts.
 */

import { create } from 'zustand'
import type { StockStoreState } from './stockStoreTypes'
import { INITIAL_ITEMS } from './stockStoreSeedData'
import { createStockTransferActions } from './stockStoreTransferActions'
import { createStockQuantityActions } from './stockStoreQuantityActions'
import { createStockItemActions } from './stockStoreItemActions'

export type {
  StockItem,
  StockTransfer,
  StockEvent,
  StockEventKind,
  StockTransferStatus,
  StockCategory,
  StockSubCategory,
} from './stockStoreTypes'

/**
 * @description Shared stock store for items, transfers, audit events, and item management.
 * Emits stock-related events after each mutation.
 */
export const useStockStore = create<StockStoreState>((set, get) => ({
  items: INITIAL_ITEMS,
  transfers: [],
  events: [],
  ...createStockTransferActions(set, get),
  ...createStockQuantityActions(set, get),
  ...createStockItemActions(set, get),
}))
