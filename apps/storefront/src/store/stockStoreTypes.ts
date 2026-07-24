/**
 * @file stockStoreTypes.ts
 * @description Shared type definitions for the stock store, domain, and events.
 * Store modules only hold raw state and CRUD logic; these types are reused by
 * domain and orchestration layers to avoid circular dependencies.
 */

import type { StateCreator } from 'zustand'
import type { BranchId } from '../types/orders'

/**
 * @description Supported stock product categories.
 */
export type StockCategory =
  | 'Arrangement'
  | 'Bouquet'
  | 'Flowers'
  | 'Supplies'
  | 'Other'

/**
 * @description Sub-category used only for Arrangement and Bouquet products,
 * indicating whether the flowers used are fresh or artificial.
 */
export type StockSubCategory = 'fresh_flower' | 'artificial_flower'

/**
 * @description Operational status of a stock item.
 */
export type StockItemStatus = 'active' | 'low' | 'expired' | 'in_transit'

/**
 * @description Freshness / risk level for perishable items.
 */
export type StockFreshness = 'fresh' | 'near_expiry' | 'expired'

/**
 * @description Status of a branch transfer.
 */
export type StockTransferStatus =
  | 'requested'
  | 'in_transit'
  | 'received'
  | 'cancelled'

/**
 * @description Single stock item as shown in the Stock view.
 */
export interface StockItem {
  /** Unique identifier for this stock line. */
  id: string
  /** Human-friendly product name (e.g. "White Rose"). */
  name: string
  /** Branch this stock physically belongs to. */
  branch: BranchId
  /** Logical grouping for filters. */
  category: StockCategory
  /** Fresh vs artificial flower, applicable only when category is Arrangement or Bouquet. */
  subCategory?: StockSubCategory
  /** Available (unreserved) quantity. */
  availableQty: number
  /** Reserved quantity (already tied to orders). */
  reservedQty: number
  /** Display unit (stems, bunches, rolls, etc.). */
  unit: string
  /** Threshold at or below which the item is considered low stock. */
  lowStockThreshold: number
  /** Whether freshness / expiry applies. */
  isPerishable: boolean
  /** Optional ISO date string representing expiry. */
  expiryDate?: string
  /** Whether this item has been archived (hidden from the active list, kept for history). */
  isArchived?: boolean
}

/**
 * @description Transfer record between branches for a specific stock item.
 */
export interface StockTransfer {
  id: string
  itemId: string
  fromBranch: BranchId
  toBranch: BranchId
  quantity: number
  status: StockTransferStatus
  createdAt: string
  updatedAt: string
  actor: string
}

/**
 * @description Types of stock audit events. 'transfer' records a branch
 * transfer status change; the rest ('loss' / 'write_off' / 'expiry_adjustment'
 * / 'sale') all represent a quantity change on the item.
 */
export type StockEventKind = 'loss' | 'write_off' | 'expiry_adjustment' | 'sale' | 'transfer' | 'restock'

/**
 * @description A single audit event for a stock item (loss, write-off, expiry).
 */

export interface StockEvent {
  id: string
  itemId: string
  kind: StockEventKind
  quantity: number
  reason: string
  actor: string
  createdAt: string
}

/**
 * @description Internal state for the stock store (raw data + CRUD only).
 * Action implementations live in the sibling stockStoreXActions.ts files;
 * this interface is the shared contract they all implement pieces of.
 */
export interface StockStoreState {
  items: StockItem[]
  transfers: StockTransfer[]
  events: StockEvent[]
  /**
   * @description Creates a new transfer request from one branch to another.
   */
  requestTransfer: (params: {
    itemId: string
    fromBranch: BranchId
    toBranch: BranchId
    quantity: number
    actor: string
  }) => void
  /**
   * @description Applies a legal stock-transfer transition and records an audit event.
   * Illegal, same-state, skipped-stage, and terminal writes are no-ops.
   */
  updateTransferStatus: (params: {
    transferId: string
    status: StockTransferStatus
    actor: string
  }) => void
  /**
   * @description Records a loss / write-off event and adjusts available quantity.
   */
  recordLossOrWriteOff: (params: {
    itemId: string
    quantity: number
    kind: StockEventKind
    reason: string
    actor: string
  }) => void
  /**
   * @description Deducts stock for one or more items consumed by a completed
   * sale (an order). Silently ignores unknown item ids so a stale/removed
   * Catalog↔Stock link never breaks order creation. Records a 'sale' audit
   * event per item actually deducted and re-runs low-stock/expiry alerts.
   */
  deductStockForSale: (params: {
    deductions: { itemId: string; quantity: number }[]
    reason: string
  }) => void
  /**
   * @description Inverse of `deductStockForSale`: restores stock for one or
   * more items when an order that already deducted them is cancelled/voided
   * (or a cancel change-request is approved). Silently ignores unknown item
   * ids, same as `deductStockForSale`. Records a 'restock' audit event per
   * item actually restored and re-runs low-stock/expiry alerts.
   */
  restockForOrder: (params: {
    restocks: { itemId: string; quantity: number }[]
    reason: string
  }) => void
  /**
   * @description Adds a new stock item for a branch.
   */
  addItem: (params: {
    name: string
    branch: BranchId
    category: StockCategory
    subCategory?: StockSubCategory
    availableQty: number
    reservedQty: number
    unit: string
    lowStockThreshold: number
    isPerishable: boolean
    expiryDate?: string
  }) => void
  /**
   * @description Updates fields on an existing stock item.
   */
  updateItem: (itemId: string, patch: Partial<Omit<StockItem, 'id'>>) => void
  /**
   * @description Sets the archived flag on a batch of items at once, used by
   * the bulk-manage toolbar. Archived items are hidden from the default
   * list view but kept for history.
   */
  archiveItems: (itemIds: string[], isArchived: boolean) => void
  /**
   * @description Permanently removes a batch of items, used by the
   * bulk-manage toolbar's Delete action.
   */
  deleteItems: (itemIds: string[]) => void
}

export type StockStoreSet = Parameters<StateCreator<StockStoreState>>[0]
export type StockStoreGet = Parameters<StateCreator<StockStoreState>>[1]
