import { beforeEach, describe, expect, it } from 'vitest'
import { useSettingsStore } from './settingsStore'
import { useStockStore } from './stockStore'
import { migrateOperationalSnapshot, OPERATIONAL_SCHEMA_VERSION } from './operationalPersistence'
import type { StockItem } from './stockStoreTypes'

const item: StockItem = {
  id: 'rose-kdm', name: 'Rose', branch: 'Kedamaian', category: 'Flowers',
  availableQty: 10, reservedQty: 0, unit: 'stems', lowStockThreshold: 2,
  isPerishable: false,
}

describe('inventory feature gate', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings()
    useStockStore.setState({ items: [item], transfers: [], events: [] })
  })

  it('preserves saved inventory when Owner turns the feature off', () => {
    useSettingsStore.getState().updateStoreProfile({ inventoryEnabled: true })
    useSettingsStore.getState().updateStoreProfile({ inventoryEnabled: false })
    expect(useStockStore.getState().items).toEqual([item])
  })

  it('blocks manual and automatic inventory mutations while disabled', () => {
    useStockStore.getState().updateItem('rose-kdm', { availableQty: 99 })
    useStockStore.getState().deductStockForSale({ deductions: [{ itemId: 'rose-kdm', quantity: 3 }], reason: 'Order' })
    useStockStore.getState().requestTransfer({ itemId: 'rose-kdm', fromBranch: 'Kedamaian', toBranch: 'Pahoman', quantity: 2, actor: 'Owner' })
    expect(useStockStore.getState().items[0].availableQty).toBe(10)
    expect(useStockStore.getState().transfers).toHaveLength(0)
  })


  it('does not expose order-linked stock reservation actions', () => {
    const stock = useStockStore.getState() as unknown as Record<string, unknown>
    expect(stock.reserveStockForOrder).toBeUndefined()
    expect(stock.commitOrderReservation).toBeUndefined()
    expect(stock.releaseOrderReservation).toBeUndefined()
    expect(stock.restoreCommittedOrderStock).toBeUndefined()
  })

  it('removes legacy Catalog recipe links during migration', () => {
    const migrated = migrateOperationalSnapshot({
      version: 15,
      revision: 1,
      savedAt: '2026-07-12T00:00:00.000Z',
      state: {
        settings: { storeProfile: { inventoryEnabled: false } },
        stock: { items: [], transfers: [], events: [], reservations: [{ id: 'legacy' }] },
        catalog: { products: [{ id: 'p1', linkedStockItemIds: ['missing'], recipe: [{ stockItemId: 'missing', quantityPerUnit: 1 }] }] },
      },
    })
    expect(migrated?.version).toBe(OPERATIONAL_SCHEMA_VERSION)
    const products = (
      migrated?.state.catalog as { products?: Array<Record<string, unknown>> } | undefined
    )?.products ?? []
    expect(products.length).toBeGreaterThan(0)
    expect(products.every((product) =>
      !('linkedStockItemIds' in product) && !('recipe' in product),
    )).toBe(true)
    expect(migrated?.state.stock).toEqual({ items: [], transfers: [], events: [] })
  })
})
