import { describe, expect, it } from 'vitest'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import {
  getStorefrontCartLineImage,
  getStorefrontProductDetailGallery,
  getStorefrontVariantGallery,
} from './storefrontProductImages'

const product: CatalogProduct = {
  id: 'product-1',
  productId: 'BDY-000001',
  category: 'Birthday',
  material: 'fresh',
  name: 'Rose Bouquet',
  isActive: true,
  images: [{
    id: 'base',
    url: 'https://example.com/base.jpg',
    sortOrder: 0,
    isPrimary: true,
  }],
  variants: [
    {
      id: 'small',
      sku: 'ROSE-S',
      size: 'Small',
      price: 150_000,
      status: 'active',
      images: [{
        id: 'small-image',
        url: 'https://example.com/small.jpg',
        sortOrder: 0,
        isPrimary: true,
      }],
    },
    {
      id: 'large',
      sku: 'ROSE-L',
      size: 'Large',
      price: 250_000,
      status: 'active',
      images: [{
        id: 'large-image',
        url: 'https://example.com/large.jpg',
        sortOrder: 0,
        isPrimary: true,
      }],
    },
    {
      id: 'inactive',
      sku: 'ROSE-OLD',
      size: 'Old',
      price: 99_000,
      status: 'inactive',
      images: [{
        id: 'old-image',
        url: 'https://example.com/old.jpg',
        sortOrder: 0,
        isPrimary: true,
      }],
    },
  ],
}

describe('Storefront variant images', () => {
  it('builds the detail gallery with Catalog default first and active variant photos after it', () => {
    expect(getStorefrontProductDetailGallery(product)).toEqual([
      { url: 'https://example.com/base.jpg', kind: 'catalog' },
      { url: 'https://example.com/small.jpg', kind: 'variant', variantId: 'small', size: 'Small' },
      { url: 'https://example.com/large.jpg', kind: 'variant', variantId: 'large', size: 'Large' },
    ])
  })

  it('uses variant-owned photos when present', () => {
    expect(getStorefrontVariantGallery(product, product.variants[0])).toEqual([
      'https://example.com/small.jpg',
    ])
    expect(getStorefrontCartLineImage([product], product.id, 'small')).toBe(
      'https://example.com/small.jpg',
    )
  })

  it('falls back to the base product photo when a variant has no photos', () => {
    const withoutImage = { ...product.variants[1], images: [] }
    expect(getStorefrontVariantGallery(product, withoutImage)).toEqual([
      'https://example.com/base.jpg',
    ])
  })
})
