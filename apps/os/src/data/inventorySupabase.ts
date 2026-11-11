import { getSupabaseAuthClient } from '../api/supabaseAuth'
import type { InventoryCategory, InventoryOverview, InventoryPurchase, PurchaseStatus } from '../domain/inventoryDomain'

const requireClient = () => {
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase is not configured.')
  return client
}

export const fetchInventoryOverview = async (branchId?: string): Promise<InventoryOverview> => {
  const { data, error } = await requireClient().rpc('get_inventory_overview', { p_branch_id: branchId ?? null })
  if (error) throw new Error(error.message)
  const raw = (data ?? {}) as Partial<InventoryOverview>
  return { items: Array.isArray(raw.items) ? raw.items : [], suppliers: Array.isArray(raw.suppliers) ? raw.suppliers : [] }
}

export const fetchInventoryPurchases = async (status?: PurchaseStatus): Promise<InventoryPurchase[]> => {
  const { data, error } = await requireClient().rpc('get_inventory_purchases', { p_status: status ?? null, p_limit: 200 })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? (data as InventoryPurchase[]) : []
}

export const saveInventoryItem = async (input: {
  id?: string; branchId: string; name: string; category: InventoryCategory; unit: string
  lowStockThreshold: number; isPerishable: boolean; isArchived: boolean
}): Promise<string> => {
  const { data, error } = await requireClient().rpc('save_inventory_item', {
    p_id: input.id ?? null, p_branch_id: input.branchId, p_name: input.name, p_category: input.category, p_unit: input.unit,
    p_low_stock_threshold: input.lowStockThreshold, p_is_perishable: input.isPerishable, p_is_archived: input.isArchived,
  })
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export const saveInventorySupplier = async (input: { id?: string; name: string; phone?: string; note?: string; isActive: boolean }): Promise<string> => {
  const { data, error } = await requireClient().rpc('save_inventory_supplier', {
    p_id: input.id ?? null, p_name: input.name, p_phone: input.phone ?? null, p_note: input.note ?? null, p_is_active: input.isActive,
  })
  if (error) throw new Error(error.message)
  return (data as { id: string }).id
}

export const recordInventoryPurchase = async (input: {
  itemId: string; supplierId?: string | null; quantity: number; unitCostIdr: number; fundingAccountId: string; purchasedOn: string; note?: string
}): Promise<{ id: string; totalIdr: number }> => {
  const { data, error } = await requireClient().rpc('record_inventory_purchase', {
    p_item_id: input.itemId, p_supplier_id: input.supplierId ?? null, p_quantity: input.quantity, p_unit_cost_idr: Math.round(input.unitCostIdr),
    p_funding_account_id: input.fundingAccountId, p_purchased_on: input.purchasedOn, p_note: input.note ?? null,
  })
  if (error) throw new Error(error.message)
  return data as { id: string; totalIdr: number }
}

export interface PurchaseDecision {
  id: string; status: PurchaseStatus; alreadyDecided?: boolean
  totalIdr?: number; branchId?: string; fundingAccountId?: string; purchasedOn?: string; itemName?: string
}

/** Finance and Owner. Confirming returns what the client needs to write the ledger expense. */
export const decideInventoryPurchase = async (purchaseId: string, decision: 'confirmed' | 'rejected', note?: string): Promise<PurchaseDecision> => {
  const { data, error } = await requireClient().rpc('decide_inventory_purchase', { p_purchase_id: purchaseId, p_decision: decision, p_note: note ?? null })
  if (error) throw new Error(error.message)
  return data as PurchaseDecision
}
