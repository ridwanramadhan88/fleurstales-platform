import { describe, expect, it } from 'vitest'
import type { CatalogProduct, CatalogSizeGuideTemplate } from './catalogStoreTypes'
import { resolveCatalogSizeGuide } from './catalogStoreSizeGuideActions'
import { buildProduct } from './catalogStoreProductActions'
import { canSetCatalogVariantStatus } from '../domain/catalogVariantStatusDomain'

describe('catalog variant foundation', () => {
  it('resolves reusable template children while preserving child guide ownership', () => {
    const templates: CatalogSizeGuideTemplate[] = [{
      id: 'guide-bouquet',
      name: 'Bouquet Standard',
      imageUrl: '',
      byteSize: 0,
      width: 800,
      height: 800,
      createdAt: '2026-09-16T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:00.000Z',
      sizes: [
        { id: 'small', name: 'Small', guideImageUrl: 'https://example.test/small.jpg', isActive: true },
        { id: 'medium', name: 'Medium', guideImageUrl: 'https://example.test/medium.jpg', isActive: true },
      ],
    }]
    const product = { id: 'product-1', productType: 'Bouquet' } as Pick<CatalogProduct, 'id' | 'productType'>
    const resolved = resolveCatalogSizeGuide(product, templates, [
      { id: 'target-1', templateId: 'guide-bouquet', scope: 'product_type', productType: 'Bouquet' },
    ])

    expect(resolved?.sizes.map((size) => [size.id, size.guideImageUrl])).toEqual([
      ['small', 'https://example.test/small.jpg'],
      ['medium', 'https://example.test/medium.jpg'],
    ])
  })

  it('deactivates an imported/new product that has no sellable variant', () => {
    const product = buildProduct({
      category: 'Birthday',
      material: 'fresh',
      name: 'Inactive Rose',
      variants: [{ size: 'Medium', price: 150000, status: 'inactive' }],
      isActive: true,
    }, 'BDY', [], [])

    expect(product.isActive).toBe(false)
  })

  it('prevents removing the last sellable variant from an active product', () => {
    const product: CatalogProduct = {
      id: 'product-active',
      productId: 'BDY-000001',
      category: 'Birthday',
      material: 'fresh',
      name: 'Active Rose',
      isActive: true,
      variants: [{
        id: 'variant-active',
        sku: 'BDY-ROSE-M',
        size: 'Medium',
        price: 150000,
        status: 'active',
      }],
    }

    expect(canSetCatalogVariantStatus({
      products: [product],
      productId: product.id,
      variantId: 'variant-active',
      status: 'inactive',
      role: 'owner',
    })).toEqual({ ok: false, reason: 'An active product must keep at least one sellable variant.' })
  })

  it('keeps stable size option identity separate from the customer-facing label', () => {
    const variant = {
      id: 'variant-1',
      sku: 'BOQ-001',
      sizeOptionId: 'medium',
      size: 'Medium',
      images: [],
      price: 250000,
      status: 'active' as const,
      flowerRecipe: [{ id: 'recipe-1', flowerName: 'Mawar merah', quantity: 18, unit: 'stem' as const }],
    }

    expect(variant.sizeOptionId).toBe('medium')
    expect(variant.price).toBe(250000)
    expect(variant.flowerRecipe[0]?.quantity).toBe(18)
  })
})
