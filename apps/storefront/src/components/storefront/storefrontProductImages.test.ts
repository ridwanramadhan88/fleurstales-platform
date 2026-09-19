import { describe, expect, it } from 'vitest'
import type { CatalogProduct } from '../../store/catalogStoreTypes'
import {
  getStorefrontCartLineImage,
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
    },
  ],
}

describe('Storefront variant images', () => {
  it('uses variant-owned photos when present', () => {
    expect(getStorefrontVariantGallery(product, product.variants[0])).toEqual([
      'https://example.com/small.jpg',
    ])
    expect(getStorefrontCartLineImage([product], product.id, 'small')).toBe(
      'https://example.com/small.jpg',
    )
  })

  it('falls back to the base product photo when a variant has no photos', () => {
    expect(getStorefrontVariantGallery(product, product.variants[1])).toEqual([
      'https://example.com/base.jpg',
    ])
    expect(getStorefrontCartLineImage([product], product.id, 'large')).toBe(
      'https://example.com/base.jpg',
    )
  })
})
