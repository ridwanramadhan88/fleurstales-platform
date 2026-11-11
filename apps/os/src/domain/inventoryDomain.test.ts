import { describe, expect, it } from 'vitest'
import { computePurchaseTotal, getInventoryLevel, summarizeInventory, summarizePendingPurchases, validatePurchaseDraft, type InventoryItem, type InventoryPurchase } from './inventoryDomain'

const item = (patch: Partial<InventoryItem>): InventoryItem => ({
  id: 'i', branchId: 'Kedamaian', name: 'Mawar', category: 'flowers', unit: 'tangkai', quantity: 10, lowStockThreshold: 5,
  lastUnitCostIdr: 2000, avgUnitCostIdr: 2000, isPerishable: true, isArchived: false, ...patch,
})

describe('inventory levels', () => {
  it('flags out, low and ok', () => {
    expect(getInventoryLevel(item({ quantity: 0 }))).toBe('out')
    expect(getInventoryLevel(item({ quantity: 5 }))).toBe('low')
    expect(getInventoryLevel(item({ quantity: 6 }))).toBe('ok')
  })

  it('summarizes active items and their value, ignoring archived ones', () => {
    const summary = summarizeInventory([item({ quantity: 10 }), item({ id: 'b', quantity: 0 }), item({ id: 'c', quantity: 3, avgUnitCostIdr: null }), item({ id: 'd', isArchived: true, quantity: 99 })])
    expect(summary).toEqual({ total: 3, low: 1, out: 1, valueIdr: 20000 })
  })
})

describe('purchases', () => {
  it('computes a rounded total', () => {
    expect(computePurchaseTotal(2.5, 3001)).toBe(7503)
  })

  it('validates a draft in order', () => {
    const ok = { itemId: 'i', quantity: 2, unitCostIdr: 1000, fundingAccountId: 'cash:main', purchasedOn: '2026-11-10' }
    expect(validatePurchaseDraft(ok, '2026-11-11')).toBeNull()
    expect(validatePurchaseDraft({ ...ok, itemId: '' }, '2026-11-11')).toBe('item')
    expect(validatePurchaseDraft({ ...ok, quantity: 0 }, '2026-11-11')).toBe('quantity')
    expect(validatePurchaseDraft({ ...ok, unitCostIdr: -1 }, '2026-11-11')).toBe('price')
    expect(validatePurchaseDraft({ ...ok, fundingAccountId: ' ' }, '2026-11-11')).toBe('account')
    expect(validatePurchaseDraft({ ...ok, purchasedOn: '2026-11-12' }, '2026-11-11')).toBe('date')
  })

  it('counts only purchases waiting for Finance', () => {
    const purchase = (status: InventoryPurchase['status'], totalIdr: number) => ({ status, totalIdr }) as InventoryPurchase
    expect(summarizePendingPurchases([purchase('pending_finance', 100), purchase('confirmed', 500), purchase('pending_finance', 50)])).toEqual({ count: 2, totalIdr: 150 })
  })
})
