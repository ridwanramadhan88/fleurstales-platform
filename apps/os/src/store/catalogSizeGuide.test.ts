import { describe, expect, it } from 'vitest'
import type { CatalogSizeGuideTarget, CatalogSizeGuideTemplate } from './catalogStoreTypes'
import { resolveCatalogSizeGuide } from './catalogStoreSizeGuideActions'

const template = (id: string): CatalogSizeGuideTemplate => ({
  id,
  name: id,
  imageUrl: 'data:image/jpeg;base64,AA==',
  byteSize: 1,
  width: 800,
  height: 800,
  createdAt: '2026-07-24T00:00:00.000Z',
  updatedAt: '2026-07-24T00:00:00.000Z',
})

describe('catalog size guide resolution', () => {
  it('uses an arrangement type assignment as the default', () => {
    const templates = [template('bouquet')]
    const targets: CatalogSizeGuideTarget[] = [
      { id: 'target-1', templateId: 'bouquet', scope: 'product_type', productType: 'Bouquet' },
    ]
    expect(resolveCatalogSizeGuide({ id: 'product-1', productType: 'Bouquet' }, templates, targets)?.id).toBe('bouquet')
  })

  it('lets a product-specific assignment override its arrangement type', () => {
    const templates = [template('bouquet'), template('large-product')]
    const targets: CatalogSizeGuideTarget[] = [
      { id: 'target-1', templateId: 'bouquet', scope: 'product_type', productType: 'Bouquet' },
      { id: 'target-2', templateId: 'large-product', scope: 'product', productId: 'product-1' },
    ]
    expect(resolveCatalogSizeGuide({ id: 'product-1', productType: 'Bouquet' }, templates, targets)?.id).toBe('large-product')
  })
})
