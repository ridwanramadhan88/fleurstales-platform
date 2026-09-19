import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from './catalogStore'
import type { CatalogProduct, CatalogSizeGuideTemplate } from './catalogStoreTypes'
import { useUserStore } from './userStore'

const baseTemplate: CatalogSizeGuideTemplate = {
  id: 'guide-bouquet',
  name: 'Bouquet Standard',
  sizes: [{ id: 'medium', name: 'Medium', sortOrder: 0, isActive: true }],
  imageUrl: '',
  byteSize: 0,
  width: 800,
  height: 800,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
}

const product: CatalogProduct = {
  id: 'product-1',
  productId: 'BDY-000001',
  category: 'Birthday',
  productType: 'Bouquet',
  material: 'fresh',
  name: 'Rose Bouquet',
  isActive: true,
  variants: [{
    id: 'variant-1',
    sku: 'BDY-ROSE-M',
    sizeOptionId: 'medium',
    size: 'Medium',
    price: 150_000,
    status: 'active',
  }],
}

describe('Catalog Size Template draft commit', () => {
  beforeEach(() => {
    useUserStore.getState().setRole('owner')
    useCatalogStore.setState({
      products: [structuredClone(product)],
      arrangementTypes: ['Bouquet', 'Giant Flower'],
      sizeGuideTemplates: [structuredClone(baseTemplate)],
      sizeGuideTargets: [],
    })
  })

  it('commits a valid Arrangement Type default without needing an existing Product of that type', () => {
    const state = useCatalogStore.getState()
    const applied = state.applySizeGuideLibraryDraft({
      templates: [structuredClone(baseTemplate)],
      targets: [{
        id: 'target-giant',
        templateId: 'guide-bouquet',
        scope: 'product_type',
        productType: 'Giant Flower',
      }],
    })

    expect(applied).toBe(true)
    expect(useCatalogStore.getState().sizeGuideTargets).toEqual([
      expect.objectContaining({ scope: 'product_type', productType: 'Giant Flower', templateId: 'guide-bouquet' }),
    ])
  })

  it('rejects a draft that archives a size still used by a sellable variant', () => {
    const archived = structuredClone(baseTemplate)
    archived.sizes[0].isActive = false

    expect(useCatalogStore.getState().applySizeGuideLibraryDraft({
      templates: [archived],
      targets: [],
    })).toBe(false)

    expect(useCatalogStore.getState().sizeGuideTemplates[0].sizes[0].isActive).toBe(true)
  })

  it('rejects duplicate Template names instead of silently normalizing them', () => {
    const duplicate = { ...structuredClone(baseTemplate), id: 'guide-other' }

    expect(useCatalogStore.getState().applySizeGuideLibraryDraft({
      templates: [structuredClone(baseTemplate), duplicate],
      targets: [],
    })).toBe(false)
  })
})
