import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOG_IMAGE_MAX_COUNT } from '../domain/catalogImageDomain'
import {
  getStorefrontProductGallery,
  getStorefrontProductThumbnail,
} from '../components/storefront/storefrontProductImages'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const productWithoutImages = {
  id: 'catalog_test',
  productId: 'TST-1',
  category: 'Birthday',
  occasionTags: ['Birthday'],
  material: 'fresh' as const,
  name: 'No fallback',
  variants: [],
  isActive: true,
  isFeatured: false,
  isCustomizable: false,
}

describe('canonical storefront product images', () => {
  it('does not synthesize demo pictures when product image data is empty', () => {
    expect(getStorefrontProductThumbnail(productWithoutImages)).toBe('')
    expect(getStorefrontProductGallery(productWithoutImages)).toEqual([])
  })

  it('uses the five-image catalog contract', () => {
    expect(CATALOG_IMAGE_MAX_COUNT).toBe(5)
    expect(read('src/components/catalog/CatalogItemFormSheet.tsx')).toContain(
      '.slice(0, CATALOG_IMAGE_MAX_COUNT)',
    )
  })
})
