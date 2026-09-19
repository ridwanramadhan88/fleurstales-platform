import { describe, expect, it } from 'vitest'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import {
  catalogStateToSharedSnapshot,
  sharedCatalogSnapshotToLocalState,
} from './catalogLocalAdapter'

const product: CatalogProduct = {
  id: 'product-1',
  productId: 'BDY-000001',
  category: 'Birthday',
  occasionTags: ['Birthday'],
  productType: 'Bouquet',
  material: 'fresh',
  name: 'Rose Bouquet',
  isActive: true,
  variants: [{
    id: 'variant-1',
    sku: 'BDY-ROSE-M',
    sizeOptionId: 'medium',
    size: 'Medium',
    images: [{
      id: 'variant-image',
      url: 'https://example.com/variant.jpg',
      storagePath: 'product-1/variant-image.jpg',
      sortOrder: 0,
      isPrimary: true,
      mimeType: 'image/jpeg',
    }],
    price: 250_000,
    cost: 100_000,
    status: 'active',
    flowerRecipe: [{
      id: 'rose',
      flowerName: 'Red Rose',
      quantity: 18,
      unit: 'stem',
    }],
  }],
  images: [{
    id: 'base-image',
    url: 'https://example.com/base.jpg',
    storagePath: 'product-1/base-image.jpg',
    sortOrder: 0,
    isPrimary: true,
    mimeType: 'image/jpeg',
  }],
}

describe('Catalog local shared adapter variant parity', () => {
  it('round-trips stable size identity, variant photos, Cost and recipe without flattening them', () => {
    const snapshot = catalogStateToSharedSnapshot({
      categories: [{ id: 'cat-birthday', name: 'Birthday', prefix: 'BDY' }],
      products: [product],
      deletedProductIds: [],
    }, 7)

    const sharedVariant = snapshot.products[0].variants[0]
    expect(sharedVariant.sizeOptionId).toBe('medium')
    expect(sharedVariant.images?.[0]).toEqual(expect.objectContaining({
      id: 'variant-image',
      variantId: 'variant-1',
    }))
    expect(sharedVariant.costIdr).toBe(100_000)
    expect(sharedVariant.flowerRecipe?.[0]).toEqual(expect.objectContaining({
      flowerName: 'Red Rose',
      sortOrder: 0,
    }))

    const restored = sharedCatalogSnapshotToLocalState(snapshot)
    const variant = restored.products[0].variants[0]
    expect(variant.sizeOptionId).toBe('medium')
    expect(variant.images?.[0].url).toBe('https://example.com/variant.jpg')
    expect(variant.cost).toBe(100_000)
    expect(variant.flowerRecipe).toEqual([{
      id: 'rose',
      flowerName: 'Red Rose',
      quantity: 18,
      unit: 'stem',
    }])
    expect(restored.products[0].images?.[0].url).toBe('https://example.com/base.jpg')
  })
})
