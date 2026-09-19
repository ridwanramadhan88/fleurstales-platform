import { describe, expect, it } from 'vitest'
import type {
  CatalogProduct,
  CatalogSizeGuideTarget,
  CatalogSizeGuideTemplate,
} from '../store/catalogStoreTypes'
import {
  getStorefrontVariantAvailability,
  getStorefrontVariantSizeGuide,
  projectStorefrontCatalog,
  projectStorefrontProduct,
} from './storefrontCatalogProjectionDomain'

const template: CatalogSizeGuideTemplate = {
  id: 'guide-bouquet',
  name: 'Bouquet Standard',
  sizes: [
    {
      id: 'small',
      name: 'Small',
      guideImageUrl: 'https://example.com/small.jpg',
      sortOrder: 0,
      isActive: true,
    },
    {
      id: 'large',
      name: 'Large',
      guideImageUrl: 'https://example.com/large.jpg',
      sortOrder: 1,
      isActive: true,
    },
  ],
  imageUrl: 'https://example.com/legacy-parent.jpg',
  byteSize: 10,
  width: 800,
  height: 800,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
}

const target: CatalogSizeGuideTarget = {
  id: 'target-bouquet',
  templateId: template.id,
  scope: 'product_type',
  productType: 'Bouquet',
}

const product = (): CatalogProduct => ({
  id: 'product-1',
  productId: 'BDY-000001',
  category: 'Birthday',
  productType: 'Bouquet',
  material: 'fresh',
  name: 'Rose Bouquet',
  isActive: true,
  variants: [
    {
      id: 'small-variant',
      sku: 'ROSE-SMALL',
      sizeOptionId: 'small',
      size: 'Small',
      price: 150_000,
      cost: 60_000,
      status: 'active',
      flowerRecipe: [{ id: 'rose', flowerName: 'Rose', quantity: 10, unit: 'stem' }],
    },
  ],
})

describe('Storefront Catalog projection', () => {
  it('keeps a stable linked variant only when its effective child is active', () => {
    const current = product()
    expect(getStorefrontVariantAvailability(current, current.variants[0], [template], [target])).toEqual(
      expect.objectContaining({ sellable: true, code: 'sellable' }),
    )
  })

  it('hides an active variant when an Arrangement Type change makes its stable child incompatible', () => {
    const current = product()
    const changedTemplate: CatalogSizeGuideTemplate = {
      ...template,
      id: 'guide-changed',
      sizes: [{ id: 'medium', name: 'Medium', sortOrder: 0, isActive: true }],
    }
    const changedTarget: CatalogSizeGuideTarget = {
      ...target,
      templateId: changedTemplate.id,
    }

    expect(getStorefrontVariantAvailability(current, current.variants[0], [changedTemplate], [changedTarget])).toEqual({
      sellable: false,
      code: 'size_needs_review',
    })
    expect(projectStorefrontCatalog([current], [changedTemplate], [changedTarget])).toEqual([])
  })

  it('hides a linked variant when its child is archived', () => {
    const current = product()
    const archived = structuredClone(template)
    archived.sizes[0].isActive = false

    expect(getStorefrontVariantAvailability(current, current.variants[0], [archived], [target]).code).toBe('size_archived')
    expect(projectStorefrontProduct(current, [archived], [target])).toBeNull()
  })

  it('keeps legacy unlinked variants sellable without guessing a child by label', () => {
    const current = product()
    current.variants[0].sizeOptionId = undefined
    current.variants[0].size = 'Small'

    const projected = projectStorefrontProduct(current, [template], [target])
    expect(projected?.variants).toHaveLength(1)
    expect(getStorefrontVariantSizeGuide(current, current.variants[0], [template], [target])).toBeNull()
  })

  it('strips internal Cost and flower recipe from customer-facing variants', () => {
    const projected = projectStorefrontProduct(product(), [template], [target])
    expect(projected?.variants[0]).not.toHaveProperty('cost')
    expect(projected?.variants[0]).not.toHaveProperty('flowerRecipe')
  })

  it('resolves the customer Size Guide by stable child ID only', () => {
    const current = product()
    const resolved = getStorefrontVariantSizeGuide(current, current.variants[0], [template], [target])
    expect(resolved?.size.id).toBe('small')
    expect(resolved?.size.guideImageUrl).toBe('https://example.com/small.jpg')

    current.variants[0].sizeOptionId = 'does-not-exist'
    current.variants[0].size = 'Small'
    expect(getStorefrontVariantSizeGuide(current, current.variants[0], [template], [target])).toBeNull()
  })
})
