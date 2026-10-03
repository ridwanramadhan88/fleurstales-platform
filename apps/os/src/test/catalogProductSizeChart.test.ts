import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from '../store/catalogStore'
import type { CatalogSizeGuideTemplate } from '../store/catalogStoreTypes'
import { useUserStore } from '../store/userStore'
import { setProductSizeChart } from '../components/catalog/CatalogTabContentController'
import { remapVariantsToSizeChart, variantNeedsChartSize, type VariantRow } from '../components/catalog/CatalogItemFormSheet'

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

describe('Switching a product to another size chart', () => {
  const row = (sizeOptionId: string | undefined, size: string): VariantRow => ({
    sizeOptionId,
    size,
    images: [],
    price: '100000',
    cost: '',
    status: 'active',
    flowerRecipe: [],
  })
  const bloomBox: CatalogSizeGuideTemplate = {
    ...chart('guide-box', 'Bloom Box'),
    sizes: [
      { id: 'box-small', name: 'Small', sortOrder: 0, isActive: true },
      { id: 'box-large', name: 'Large', sortOrder: 1, isActive: true },
      { id: 'box-xl', name: 'Extra Large', sortOrder: 2, isActive: false },
    ],
  }

  it('carries sizes over by name, case-insensitively', () => {
    const remapped = remapVariantsToSizeChart(
      [row('bouquet-standard-large', 'Large'), row('bouquet-standard-small', 'small')],
      bloomBox,
    )
    expect(remapped.map((variant) => [variant.sizeOptionId, variant.size])).toEqual([
      ['box-large', 'Large'],
      ['box-small', 'Small'],
    ])
  })

  it('leaves sizes the new chart lacks, archived sizes, and duplicates for the user to pick', () => {
    const remapped = remapVariantsToSizeChart(
      [row('bouquet-standard-medium', 'Medium'), row('vase-xl', 'Extra Large'), row('box-large', 'Large'), row('bouquet-standard-large', 'Large')],
      bloomBox,
    )
    expect(remapped.map((variant) => variant.sizeOptionId)).toEqual([
      'bouquet-standard-medium',
      'vase-xl',
      'box-large',
      'bouquet-standard-large',
    ])
  })

  it('also links older unlinked variants when a matching size exists', () => {
    expect(remapVariantsToSizeChart([row(undefined, 'Small')], bloomBox)[0].sizeOptionId).toBe('box-small')
  })
})

describe('When the size-chart rule blocks saving', () => {
  const saved: VariantRow = {
    id: 'var-1', sizeOptionId: undefined, size: 'XL', images: [], price: '1', cost: '', status: 'active', flowerRecipe: [],
  }

  it('does not block an untouched older size', () => {
    expect(variantNeedsChartSize({ ...saved }, [saved], false)).toBe(false)
  })

  it('blocks new sizes, sizes whose choice changed, and every size after a chart switch', () => {
    expect(variantNeedsChartSize({ ...saved, id: undefined }, [saved], false)).toBe(true)
    expect(variantNeedsChartSize({ ...saved, sizeOptionId: 'other-chart-xl' }, [saved], false)).toBe(true)
    expect(variantNeedsChartSize({ ...saved }, [saved], true)).toBe(true)
  })
})
