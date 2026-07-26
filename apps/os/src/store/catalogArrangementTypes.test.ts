import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from './catalogStore'
import { useUserStore } from './userStore'

describe('catalog arrangement type management', () => {
  beforeEach(() => {
    useUserStore.getState().setRole('owner')
    useCatalogStore.setState({
      arrangementTypes: ['Bouquet', 'Unused type'],
      products: [{
        id: 'product-1',
        productId: 'BOQ-000001',
        category: 'General Gifting',
        productType: 'Bouquet',
        material: 'fresh',
        name: 'Test bouquet',
        variants: [{ id: 'variant-1', sku: 'BOQ-001', size: 'Standard', price: 100_000, status: 'active' }],
        isActive: true,
      }],
      sizeGuideTargets: [{
        id: 'target-1',
        templateId: 'guide-1',
        scope: 'product_type',
        productType: 'Bouquet',
      }],
    })
  })

  it('renames the registry value, products, and size-guide targets together', () => {
    expect(useCatalogStore.getState().renameArrangementType('Bouquet', 'Hand bouquet')).toEqual({ ok: true })
    expect(useCatalogStore.getState().arrangementTypes).toContain('Hand bouquet')
    expect(useCatalogStore.getState().products[0].productType).toBe('Hand bouquet')
    expect(useCatalogStore.getState().sizeGuideTargets[0]).toMatchObject({ productType: 'Hand bouquet' })
  })

  it('protects used types and removes unused types', () => {
    expect(useCatalogStore.getState().deleteArrangementType('Bouquet')).toMatchObject({ ok: false })
    expect(useCatalogStore.getState().deleteArrangementType('Unused type')).toEqual({ ok: true })
    expect(useCatalogStore.getState().arrangementTypes).toEqual(['Bouquet'])
  })
})
