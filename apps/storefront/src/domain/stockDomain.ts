/**
 * @file stockDomain.ts
 * @description Domain layer for Stock / Inventory.
 * Contains all business logic built on top of raw stock data:
 * - Freshness and expiry.
 * - Status grouping (active / low / expired / in_transit).
 * - Risk levels (green / yellow / red).
 * - Filtering and per-branch context.
 * - Low stock, expired, and in-transit helpers.
 *
 * This file is PURE and has no side effects:
 * - No React / UI imports.
 * - No direct store mutations.
 * - All functions are deterministic based on their inputs.
 */

import type {
  StockItem,
  StockTransfer,
  StockEvent,
  StockFreshness,
  StockTransferStatus,
  StockCategory,
} from '../store/stockStoreTypes'
import type { BranchId } from '../types/orders'
import { nowInJakarta } from './orderTimingDomain'

/**
 * @description Status groups for stock items, used across all UIs.
 * - active: healthy item with sufficient quantity and not expired / in transit.
 * - low: quantity at/below threshold but not expired or in transit.
 * - expired: freshness is expired.
 * - in_transit: there is at least one active transfer for this item.
 */
export type StockStatusGroup = 'active' | 'low' | 'expired' | 'in_transit'

/**
 * @description Enforces the two cross-field invariants for a stock item:
 * `subCategory` only makes sense for Arrangement/Bouquet, and `expiryDate`
 * only makes sense when `isPerishable` is true. Applies to a full field set
 * (post-merge), so it's safe to call after a partial patch has already been
 * spread onto the existing item — it re-clears anything that's now stale,
 * the same way `addItem` always has. Previously `addItem` inlined this
 * logic and `updateItem` didn't reapply it at all (gap-log §25); both now
 * call this single function so they can't drift again.
 */
export const applyStockCrossFieldRules = <
  T extends {
    category: StockCategory
    subCategory?: string
    isPerishable?: boolean
    expiryDate?: string
  },
>(
  fields: T,
): T => ({
  ...fields,
  subCategory:
    fields.category === 'Arrangement' || fields.category === 'Bouquet'
      ? fields.subCategory
      : undefined,
  expiryDate: fields.isPerishable && fields.expiryDate ? fields.expiryDate : undefined,
})

/**
 * @description Risk levels used across the app to color-code stock importance.
 * - green: safe.
 * - yellow: low stock or near expiry.
 * - red: expired or critical (zero quantity).
 */
export type StockRiskLevel = 'green' | 'yellow' | 'red'

/**
 * @description Status filters exposed to UI. 'archived' shows only items the
 * person has archived via the bulk-manage toolbar; every other filter value
 * implicitly excludes archived items so they stay out of day-to-day views.
 */
export type StockStatusFilter = 'all' | 'low' | 'expired' | 'in_transit' | 'archived'

/**
 * @description Category filters exposed to UI.
 */
export type StockCategoryFilter = 'all' | StockCategory

/**
 * @description Simplified "type" filter exposed to UI as chips: fresh /
 * artificial flower (matched against the item's subCategory, regardless of
 * whether the underlying category is Arrangement or Bouquet) and Supplies
 * (matched against category). Replaces the raw category list for Inventory.
 */
export type StockTypeFilter = 'all' | 'fresh_flower' | 'artificial_flower' | 'Supplies'

/**
 * @description Returns freshness state for a stock item based on expiry date.
 * - expired: expiryDate strictly before today.
 * - near_expiry: within the next 2 days.
 * - fresh: no expiry or further in the future.
 */
export const getFreshnessStateForItem = (item: StockItem): StockFreshness => {
  if (!item.isPerishable || !item.expiryDate) {
    return 'fresh'
  }

  // Uses Jakarta (GMT+7) wall-clock time for "today", not the device's raw
  // local time, so expiry status can't flip a day early/late depending on
  // where the staff device happens to be set — same rule Orders/HR/Vouchers
  // follow for their own date comparisons.
  const today = nowInJakarta()
  today.setHours(0, 0, 0, 0)

  const expiry = new Date(item.expiryDate)
  if (Number.isNaN(expiry.getTime())) {
    return 'fresh'
  }

  if (expiry.getTime() < today.getTime()) {
    return 'expired'
  }

  const twoDaysMs = 2 * 24 * 60 * 60 * 1000
  const diffMs = expiry.getTime() - today.getTime()

  if (diffMs <= twoDaysMs) {
    return 'near_expiry'
  }

  return 'fresh'
}

/**
 * @description Returns the first active transfer (requested or in_transit) for an item.
 */
export const getActiveTransferForItem = (
  itemId: string,
  transfers: StockTransfer[],
): StockTransfer | null => {
  const activeStatuses: StockTransferStatus[] = ['requested', 'in_transit']
  return (
    transfers.find(
      (transfer) =>
        transfer.itemId === itemId &&
        activeStatuses.includes(transfer.status as StockTransferStatus),
    ) ?? null
  )
}

/**
 * @description Returns the status group for a stock item:
 * - expired: freshness is expired.
 * - in_transit: there is an active transfer (requested / in_transit).
 * - low: availableQty <= lowStockThreshold.
 * - active: everything else.
 */
export const getStockStatusGroup = (
  item: StockItem,
  transfers: StockTransfer[],
): StockStatusGroup => {
  const freshness = getFreshnessStateForItem(item)
  if (freshness === 'expired') {
    return 'expired'
  }

  const activeTransfer = getActiveTransferForItem(item.id, transfers)
  if (activeTransfer) {
    return 'in_transit'
  }

  if (item.availableQty <= item.lowStockThreshold) {
    return 'low'
  }

  return 'active'
}

/**
 * @description Returns a risk level for a stock item combining quantity and freshness.
 * - red: expired OR zero quantity.
 * - yellow: low stock OR near expiry.
 * - green: everything else (safe).
 *
 * This is a pure helper for color semantics; UI should not re-derive risk logic.
 */
export const getStockRiskLevel = (
  item: StockItem,
  transfers: StockTransfer[],
): StockRiskLevel => {
  const freshness = getFreshnessStateForItem(item)
  const statusGroup = getStockStatusGroup(item, transfers)

  if (freshness === 'expired' || item.availableQty <= 0 || statusGroup === 'expired') {
    return 'red'
  }

  if (
    statusGroup === 'low' ||
    freshness === 'near_expiry'
  ) {
    return 'yellow'
  }

  return 'green'
}

/**
 * @description Aggregated stock summary metrics for a given list of items + transfers.
 */
export const getStockSummary = (
  items: StockItem[],
  transfers: StockTransfer[],
): {
  totalAvailable: number
  lowStockCount: number
  expiredOrNearCount: number
  activeTransferCount: number
} => {
  const totalAvailable = items.reduce(
    (sum, item) => sum + item.availableQty,
    0,
  )

  let lowStockCount = 0
  let expiredOrNearCount = 0

  items.forEach((item) => {
    const freshness = getFreshnessStateForItem(item)
    if (item.availableQty <= item.lowStockThreshold) {
      lowStockCount += 1
    }
    if (freshness === 'expired' || freshness === 'near_expiry') {
      expiredOrNearCount += 1
    }
  })

  const activeTransferCount = transfers.filter((transfer) =>
    ['requested', 'in_transit'].includes(
      transfer.status as StockTransferStatus,
    ),
  ).length

  return {
    totalAvailable,
    lowStockCount,
    expiredOrNearCount,
    activeTransferCount,
  }
}

/**
 * @description Input parameters for deriving a branch-specific stock context.
 */
export interface BranchStockContextParams {
  items: StockItem[]
  transfers: StockTransfer[]
  events: StockEvent[]
  branch: BranchId | 'All'
  statusFilter: StockStatusFilter
  typeFilter: StockTypeFilter
  /** Free-text query matched against item name (e.g. from the main top bar). */
  searchQuery?: string
}

/**
 * @description Derived branch-scoped stock context with filters applied.
 */
export interface BranchStockContext {
  /** All items for the branch (before filters). */
  branchItems: StockItem[]
  /** All transfers touching this branch. */
  branchTransfers: StockTransfer[]
  /** All audit events for items in this branch. */
  branchEvents: StockEvent[]
  /** Categories present for this branch (kept for other consumers). */
  availableCategories: StockCategory[]
  /** Items after applying status + type filters. */
  filteredItems: StockItem[]
}

/**
 * @description Returns branch-scoped stock context and filtered items.
 * All status and category rules are centralised here.
 */
export const getBranchStockContext = (
  params: BranchStockContextParams,
): BranchStockContext => {
  const { items, transfers, events, branch, statusFilter, typeFilter, searchQuery } =
    params

  const branchItems =
    branch === 'All' ? items : items.filter((item) => item.branch === branch)

  const branchItemIds = new Set(branchItems.map((item) => item.id))

  const branchTransfers = transfers.filter(
    (transfer) =>
      branchItemIds.has(transfer.itemId) ||
      branch === 'All' ||
      transfer.fromBranch === branch ||
      transfer.toBranch === branch,
  )

  const branchEvents = events.filter((event) =>
    branchItemIds.has(event.itemId),
  )

  const availableCategories: StockCategory[] = Array.from(
    new Set(
      branchItems
        .filter((item) => !item.isArchived)
        .map((item) => item.category),
    ),
  )

  const filteredItems = branchItems.filter((item) => {
    if (statusFilter === 'archived') {
      return Boolean(item.isArchived)
    }

    // Every other view is the "active" working set — archived items stay
    // out of the way until explicitly requested via the Archived filter.
    if (item.isArchived) return false

    if (typeFilter === 'fresh_flower' && item.subCategory !== 'fresh_flower') {
      return false
    }
    if (typeFilter === 'artificial_flower' && item.subCategory !== 'artificial_flower') {
      return false
    }
    if (typeFilter === 'Supplies' && item.category !== 'Supplies') {
      return false
    }

    const query = searchQuery?.trim().toLowerCase()
    if (query && !item.name.toLowerCase().includes(query)) {
      return false
    }

    if (statusFilter === 'all') return true

    const statusGroup = getStockStatusGroup(item, branchTransfers)

    if (statusFilter === 'low') return statusGroup === 'low'
    if (statusFilter === 'expired') return statusGroup === 'expired'
    if (statusFilter === 'in_transit') return statusGroup === 'in_transit'

    return true
  })

  return {
    branchItems,
    branchTransfers,
    branchEvents,
    availableCategories,
    filteredItems,
  }
}

/**
 * @description Returns items that are considered low stock based on each item's
 * own lowStockThreshold setting.
 */
export const getLowStockItems = (items: StockItem[]): StockItem[] =>
  items.filter((item) => item.availableQty <= item.lowStockThreshold)

/**
 * @description Returns items that are expired based on freshness / expiry date.
 */
export const getExpiredStock = (items: StockItem[]): StockItem[] =>
  items.filter((item) => getFreshnessStateForItem(item) === 'expired')
