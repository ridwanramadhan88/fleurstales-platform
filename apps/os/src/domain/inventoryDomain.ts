/**
 * @file inventoryDomain.ts
 * @description Pure rules for the server-backed inventory (M5): categories,
 * stock level status, purchase totals and input validation. Independent of the
 * product catalog.
 */

export type InventoryCategory = 'flowers' | 'greens' | 'packaging' | 'supplies' | 'other'
export type PurchaseStatus = 'pending_finance' | 'confirmed' | 'rejected'
export type InventoryLevel = 'out' | 'low' | 'ok'

export const INVENTORY_CATEGORIES: ReadonlyArray<{ id: InventoryCategory; en: string; id_: string }> = [
  { id: 'flowers', en: 'Flowers', id_: 'Bunga' },
  { id: 'greens', en: 'Greens', id_: 'Daun' },
  { id: 'packaging', en: 'Packaging', id_: 'Kemasan' },
  { id: 'supplies', en: 'Supplies', id_: 'Perlengkapan' },
  { id: 'other', en: 'Other', id_: 'Lainnya' },
]

export interface InventoryItem {
  id: string
  branchId: string
  name: string
  category: InventoryCategory
  unit: string
  quantity: number
  lowStockThreshold: number
  lastUnitCostIdr: number | null
  avgUnitCostIdr: number | null
  isPerishable: boolean
  isArchived: boolean
}

export interface InventorySupplier { id: string; name: string; phone: string | null; note: string | null; isActive: boolean }

export interface InventoryPurchase {
  id: string
  itemId: string
  itemName: string
  unit: string
  branchId: string
  supplierId: string | null
  supplierName: string | null
  quantity: number
  unitCostIdr: number
  totalIdr: number
  fundingAccountId: string
  purchasedOn: string
  note: string | null
  status: PurchaseStatus
  recordedByName: string
  createdAt: string
  decidedByName: string | null
  decidedAt: string | null
  decisionNote: string | null
}

export interface InventoryOverview { items: InventoryItem[]; suppliers: InventorySupplier[] }

export const getInventoryCategoryLabel = (category: InventoryCategory, language: 'en' | 'id'): string => {
  const entry = INVENTORY_CATEGORIES.find((item) => item.id === category)
  return entry ? (language === 'id' ? entry.id_ : entry.en) : category
}

export const getInventoryLevel = (item: Pick<InventoryItem, 'quantity' | 'lowStockThreshold'>): InventoryLevel => {
  if (item.quantity <= 0) return 'out'
  if (item.quantity <= item.lowStockThreshold) return 'low'
  return 'ok'
}

export interface InventorySummary { total: number; low: number; out: number; valueIdr: number }

/** Archived items are ignored. Value uses the average unit cost (items without a cost count as 0). */
export const summarizeInventory = (items: InventoryItem[]): InventorySummary => {
  const active = items.filter((item) => !item.isArchived)
  return {
    total: active.length,
    low: active.filter((item) => getInventoryLevel(item) === 'low').length,
    out: active.filter((item) => getInventoryLevel(item) === 'out').length,
    valueIdr: Math.round(active.reduce((sum, item) => sum + item.quantity * (item.avgUnitCostIdr ?? 0), 0)),
  }
}

export const computePurchaseTotal = (quantity: number, unitCostIdr: number): number => Math.round(quantity * unitCostIdr)

export interface PurchaseDraft { itemId: string; quantity: number; unitCostIdr: number; fundingAccountId: string; purchasedOn: string }

/** Returns the first problem as a message key, or null when the draft can be sent. */
export const validatePurchaseDraft = (draft: PurchaseDraft, todayIso: string): 'item' | 'quantity' | 'price' | 'account' | 'date' | null => {
  if (!draft.itemId) return 'item'
  if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) return 'quantity'
  if (!Number.isFinite(draft.unitCostIdr) || draft.unitCostIdr < 0) return 'price'
  if (!draft.fundingAccountId.trim()) return 'account'
  if (!draft.purchasedOn || draft.purchasedOn > todayIso) return 'date'
  return null
}

export const summarizePendingPurchases = (purchases: InventoryPurchase[]): { count: number; totalIdr: number } => {
  const pending = purchases.filter((purchase) => purchase.status === 'pending_finance')
  return { count: pending.length, totalIdr: pending.reduce((sum, purchase) => sum + purchase.totalIdr, 0) }
}
