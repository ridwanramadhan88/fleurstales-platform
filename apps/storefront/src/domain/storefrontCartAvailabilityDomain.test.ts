import { describe, expect, it } from 'vitest'
import type { CatalogProduct, CatalogSizeGuideTarget, CatalogSizeGuideTemplate } from '../store/catalogStoreTypes'
import { getStorefrontCartIssues } from './storefrontCartAvailabilityDomain'

const product = (overrides: Partial<CatalogProduct> = {}): CatalogProduct => ({
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
  ...overrides,
})

const template: CatalogSizeGuideTemplate = {
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

const target: CatalogSizeGuideTarget = {
  id: 'target-bouquet',
  templateId: template.id,
  scope: 'product_type',
  productType: 'Bouquet',
}

const line = { lineId: 'line-1', productId: 'product-1', variantId: 'variant-1' }

describe('Storefront cart Catalog availability', () => {
  it('accepts a sellable linked variant whose child is active in the effective template', () => {
    expect(getStorefrontCartIssues([line], [product()], [template], [target])).toEqual([])
  })

  it('blocks inactive variants already sitting in a cart', () => {
    const current = product({
      variants: [{ id: 'variant-1', sku: 'BDY-ROSE-M', sizeOptionId: 'medium', size: 'Medium', price: 150_000, status: 'inactive' }],
    })
    expect(getStorefrontCartIssues([line], [current], [template], [target])).toEqual([
      expect.objectContaining({ lineId: 'line-1', code: 'variant_unavailable' }),
    ])
  })

  it('blocks a linked variant when an Arrangement Type change makes its stable size incompatible', () => {
    const otherTemplate: CatalogSizeGuideTemplate = {
      ...template,
      id: 'guide-other',
      name: 'Other',
      sizes: [{ id: 'large', name: 'Large', sortOrder: 0, isActive: true }],
    }
    const otherTarget: CatalogSizeGuideTarget = {
      id: 'target-other',
      templateId: 'guide-other',
      scope: 'product_type',
      productType: 'Bouquet',
    }
    expect(getStorefrontCartIssues([line], [product()], [otherTemplate], [otherTarget])).toEqual([
      expect.objectContaining({ code: 'size_needs_review' }),
    ])
  })

  it('keeps historical unlinked variants compatible without guessing a Size Template child', () => {
    const legacy = product({
      variants: [{ id: 'variant-1', sku: 'BDY-ROSE-M', size: 'Medium', price: 150_000, status: 'active' }],
    })
    expect(getStorefrontCartIssues([line], [legacy], [], [])).toEqual([])
  })

  it('blocks a linked child after that child is archived', () => {
    const archivedTemplate = structuredClone(template)
    archivedTemplate.sizes[0].isActive = false
    expect(getStorefrontCartIssues([line], [product()], [archivedTemplate], [target])).toEqual([
      expect.objectContaining({ code: 'size_archived' }),
    ])
  })
})
