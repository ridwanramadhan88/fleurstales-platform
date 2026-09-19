import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from './catalogStore'
import type { CatalogProduct, CatalogSizeGuideTarget } from './catalogStoreTypes'
import { useUserStore } from './userStore'

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
    size: 'Medium',
    price: 150_000,
    status: 'active',
  }],
}

const productTarget: CatalogSizeGuideTarget = {
  id: 'target-product-1',
  templateId: 'guide-bouquet',
  scope: 'product',
  productId: 'product-1',
}

const typeTarget: CatalogSizeGuideTarget = {
  id: 'target-type',
  templateId: 'guide-bouquet',
  scope: 'product_type',
  productType: 'Bouquet',
}

describe('Catalog Product deletion integration', () => {
  beforeEach(() => {
    useUserStore.getState().setRole('owner')
    useCatalogStore.setState({
      products: [structuredClone(product)],
      deletedProductIds: [],
      sizeGuideTargets: [structuredClone(productTarget), structuredClone(typeTarget)],
    })
  })

  it('removes only the deleted Product-specific Size Template assignment', () => {
    useCatalogStore.getState().deleteProducts(['product-1'])

    expect(useCatalogStore.getState().products).toEqual([])
    expect(useCatalogStore.getState().sizeGuideTargets).toEqual([typeTarget])
    expect(useCatalogStore.getState().deletedProductIds).toContain('BDY-000001')
  })
})
