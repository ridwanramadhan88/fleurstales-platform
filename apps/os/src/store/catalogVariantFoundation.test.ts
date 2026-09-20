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

  it('keeps only the explicitly configured size variants and one photo per ownership level', () => {
    const image = (id: string, url: string, sortOrder: number) => ({
      id,
      url,
      sortOrder,
      isPrimary: sortOrder === 0,
      mimeType: 'image/jpeg' as const,
    })

    const product = buildProduct({
      category: 'Birthday',
      material: 'fresh',
      name: 'Selected Sizes Rose',
      images: [
        image('catalog-1', 'https://example.test/catalog-1.jpg', 0),
        image('catalog-2', 'https://example.test/catalog-2.jpg', 1),
      ],
      variants: [
        {
          sizeOptionId: 'medium',
          size: 'Medium',
          price: 250000,
          status: 'active',
          images: [
            image('medium-1', 'https://example.test/medium-1.jpg', 0),
            image('medium-2', 'https://example.test/medium-2.jpg', 1),
          ],
          flowerRecipe: [{ id: 'rose-m', flowerName: 'Mawar', quantity: 18, unit: 'stem' }],
        },
        {
          sizeOptionId: 'large',
          size: 'Large',
          price: 350000,
          status: 'active',
          images: [image('large-1', 'https://example.test/large-1.jpg', 0)],
          flowerRecipe: [{ id: 'rose-l', flowerName: 'Mawar', quantity: 26, unit: 'stem' }],
        },
      ],
      isActive: true,
    }, 'BDY', [], [])

    expect(product.variants.map((variant) => variant.sizeOptionId)).toEqual(['medium', 'large'])
    expect(product.images).toHaveLength(1)
    expect(product.variants[0].images).toHaveLength(1)
    expect(product.variants[1].images).toHaveLength(1)
    expect(product.variants[0].flowerRecipe?.[0]?.quantity).toBe(18)
    expect(product.variants[1].flowerRecipe?.[0]?.quantity).toBe(26)
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
