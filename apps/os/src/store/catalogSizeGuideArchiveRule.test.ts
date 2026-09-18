import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from './catalogStore'
import type { CatalogProduct, CatalogSizeGuideTemplate } from './catalogStoreTypes'
import { useUserStore } from './userStore'

const template: CatalogSizeGuideTemplate = {
  id: 'guide-bouquet',
  name: 'Bouquet Standard',
  sizes: [{ id: 'medium', name: 'Medium', sortOrder: 0, isActive: true }],
  imageUrl: '',
  byteSize: 0,
  width: 800,
  height: 800,
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
}

const productWithStatus = (status: 'active' | 'inactive'): CatalogProduct => ({
  id: 'product-1',
  productId: 'BDY-000001',
  category: 'Birthday',
  productType: 'Bouquet',
  material: 'fresh',
  name: 'Rose',
  isActive: status === 'active',
  variants: [{
    id: 'variant-1',
    sku: 'BDY-ROSE-M',
    sizeOptionId: 'medium',
    size: 'Medium',
    price: 150000,
    status,
  }],
})

describe('catalog size archive rule', () => {
  beforeEach(() => {
    useUserStore.setState({ role: 'admin' })
    useCatalogStore.setState({
      products: [],
      sizeGuideTemplates: [structuredClone(template)],
      sizeGuideTargets: [],
    })
  })

  it('blocks archiving a size referenced by a sellable variant', () => {
    useCatalogStore.setState({ products: [productWithStatus('active')] })

    expect(useCatalogStore.getState().archiveSizeGuideTemplateSize('guide-bouquet', 'medium')).toBe(false)
    expect(useCatalogStore.getState().sizeGuideTemplates[0].sizes[0].isActive).toBe(true)
  })

  it('allows archiving a size referenced only by an inactive historical variant', () => {
    useCatalogStore.setState({ products: [productWithStatus('inactive')] })

    expect(useCatalogStore.getState().archiveSizeGuideTemplateSize('guide-bouquet', 'medium')).toBe(true)
    expect(useCatalogStore.getState().sizeGuideTemplates[0].sizes[0].isActive).toBe(false)
    expect(useCatalogStore.getState().products[0].variants[0].sizeOptionId).toBe('medium')
  })
})
