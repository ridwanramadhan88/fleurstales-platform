import { beforeEach, describe, expect, it } from 'vitest'
import { useCatalogStore } from './catalogStore'
import { useUserStore } from './userStore'
import type { CatalogProduct } from './catalogStoreTypes'

const activeProduct: CatalogProduct = {
  id: 'prod-active',
  productId: 'BOQ-000001',
  category: 'Bouquets',
  occasionTags: ['Bouquets', 'General Gifting'],
  material: 'fresh',
  name: 'Active bouquet',
  variants: [{ id: 'v-active', sku: 'BOQ-FRE-ACT-STD-001', size: 'Standard', price: 200_000, status: 'active' }],
  isActive: true,
}

const inactiveProduct: CatalogProduct = {
  ...activeProduct,
  id: 'prod-inactive',
  productId: 'OLD-000001',
  category: 'Old Category',
  name: 'Inactive bouquet',
  variants: [{ id: 'v-inactive', sku: 'OLD-FRE-INA-STD-001', size: 'Standard', price: 150_000, status: 'inactive' }],
  isActive: false,
}

describe('Catalog category cleanup', () => {
  beforeEach(() => {
    useUserStore.getState().setRole('owner')
    useCatalogStore.setState({
      products: [activeProduct, inactiveProduct],
      deletedProductIds: [],
      categories: [
        { id: 'cat-bouquets', name: 'Bouquets', prefix: 'BOQ' },
        { id: 'cat-old', name: 'Old Category', prefix: 'OLD' },
      ],
    })
  })

  it('updates category name and prefix without rewriting existing identifiers', () => {
    const result = useCatalogStore.getState().updateCategory('cat-bouquets', {
      name: 'Signature Bouquets',
      prefix: 'SIG',
    })

    expect(result).toEqual({ ok: true })
    expect(useCatalogStore.getState().categories[0]).toMatchObject({
      name: 'Signature Bouquets',
      prefix: 'SIG',
    })
    expect(useCatalogStore.getState().products[0]).toMatchObject({
      category: 'Signature Bouquets',
      occasionTags: ['Signature Bouquets', 'General Gifting'],
      productId: 'BOQ-000001',
    })
    expect(useCatalogStore.getState().products[0].variants[0].sku).toBe('BOQ-FRE-ACT-STD-001')
  })

  it('blocks deletion while an active product still uses the category', () => {
    const result = useCatalogStore.getState().deleteCategory('cat-bouquets')
    expect(result).toMatchObject({ ok: false, activeProductCount: 1 })
    expect(useCatalogStore.getState().categories.some((item) => item.id === 'cat-bouquets')).toBe(true)
  })

  it('moves inactive products to Uncategorized when their category is removed', () => {
    const result = useCatalogStore.getState().deleteCategory('cat-old')
    expect(result).toEqual({ ok: true })
    expect(useCatalogStore.getState().categories.some((item) => item.name === 'Uncategorized')).toBe(true)
    expect(useCatalogStore.getState().products.find((item) => item.id === 'prod-inactive')?.category).toBe('Uncategorized')
  })

  it('blocks deletion when an active product uses an occasion only as a secondary tag', () => {
    useCatalogStore.setState((state) => ({
      ...state,
      categories: [...state.categories, { id: 'cat-gifting', name: 'General Gifting', prefix: 'GFT' }],
    }))

    const result = useCatalogStore.getState().deleteCategory('cat-gifting')
    expect(result).toMatchObject({ ok: false, activeProductCount: 1 })
  })

  it('validates unique editable prefixes', () => {
    const result = useCatalogStore.getState().updateCategory('cat-old', {
      name: 'Old Category',
      prefix: 'BOQ',
    })
    expect(result).toEqual({ ok: false, reason: 'Prefix "BOQ" is already used.' })
  })
})
