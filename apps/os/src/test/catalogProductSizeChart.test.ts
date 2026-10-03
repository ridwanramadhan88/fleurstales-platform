import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from '../store/catalogStore'
import type { CatalogSizeGuideTemplate } from '../store/catalogStoreTypes'
import { useUserStore } from '../store/userStore'
import { setProductSizeChart } from '../components/catalog/CatalogTabContentController'

const chart = (id: string, name: string): CatalogSizeGuideTemplate => ({
  id,
  name,
  sizes: [{ id: id + '-medium', name: 'Medium', sortOrder: 0, isActive: true }],
  imageUrl: '',
  byteSize: 0,
  width: 800,
  height: 800,
  createdAt: '2026-10-03T00:00:00.000Z',
  updatedAt: '2026-10-03T00:00:00.000Z',
})

const productTargets = () => useCatalogStore.getState().sizeGuideTargets
  .filter((target) => target.scope === 'product' && target.productId === 'product-1')

describe('Product size chart saved from the product editor', () => {
  beforeEach(() => {
    useUserStore.getState().setRole('owner')
    useCatalogStore.setState({
      sizeGuideTemplates: [chart('guide-bouquet', 'Bouquet Standard'), chart('guide-box', 'Bloom Box')],
      sizeGuideTargets: [],
    })
  })

  it('stores the picked chart as the product target', () => {
    setProductSizeChart('product-1', 'guide-box')
    expect(productTargets()).toEqual([expect.objectContaining({ templateId: 'guide-box' })])
  })

  it('switches the chart without leaving the old one behind', () => {
    setProductSizeChart('product-1', 'guide-bouquet')
    setProductSizeChart('product-1', 'guide-box')
    expect(productTargets()).toEqual([expect.objectContaining({ templateId: 'guide-box' })])
  })

  it('leaves the target untouched when the chart did not change, so saving does not rewrite size charts', () => {
    setProductSizeChart('product-1', 'guide-box')
    const before = useCatalogStore.getState().sizeGuideTargets
    setProductSizeChart('product-1', 'guide-box')
    expect(useCatalogStore.getState().sizeGuideTargets).toBe(before)
  })

  it('removes the product target when the chart is cleared', () => {
    setProductSizeChart('product-1', 'guide-box')
    setProductSizeChart('product-1', '')
    expect(productTargets()).toEqual([])
  })
})
