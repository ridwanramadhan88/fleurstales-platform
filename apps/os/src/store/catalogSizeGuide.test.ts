import { describe, expect, it } from 'vitest'
import type { CatalogSizeGuideTarget, CatalogSizeGuideTemplate } from './catalogStoreTypes'
import { resolveCatalogSizeGuide } from './catalogStoreSizeGuideActions'

const template = (id: string): CatalogSizeGuideTemplate => ({
  id,
  name: id,
  sizes: [],
  imageUrl: 'data:image/jpeg;base64,AA==',
  byteSize: 1,
  width: 800,
  height: 800,
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
})

describe('catalog size guide resolution', () => {
  it('uses the size chart picked for the product', () => {
    const templates = [template('bouquet')]
    const targets: CatalogSizeGuideTarget[] = [
      { id: 'target-1', templateId: 'bouquet', scope: 'product', productId: 'product-1' },
    ]
    expect(resolveCatalogSizeGuide({ id: 'product-1', productType: 'Bouquet' }, templates, targets)?.id).toBe('bouquet')
  })

  it('ignores Arrangement Type defaults: the arrangement type is only a label', () => {
    const templates = [template('bouquet')]
    const targets: CatalogSizeGuideTarget[] = [
      { id: 'target-1', templateId: 'bouquet', scope: 'product_type', productType: 'Bouquet' },
    ]
    expect(resolveCatalogSizeGuide({ id: 'product-1', productType: 'Bouquet' }, templates, targets)).toBeUndefined()
  })

  it('does not silently fall back to an unrelated template', () => {
    const templates = [template('bouquet')]
    expect(resolveCatalogSizeGuide({ id: 'product-1', productType: 'Bouquet' }, templates, [])).toBeUndefined()
  })

  it('keeps the product chart even when an old Arrangement Type default exists', () => {
    const templates = [template('bouquet'), template('large-product')]
    const targets: CatalogSizeGuideTarget[] = [
      { id: 'target-1', templateId: 'bouquet', scope: 'product_type', productType: 'Bouquet' },
      { id: 'target-2', templateId: 'large-product', scope: 'product', productId: 'product-1' },
    ]
    expect(resolveCatalogSizeGuide({ id: 'product-1', productType: 'Bouquet' }, templates, targets)?.id).toBe('large-product')
  })
})
