import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/data/shared/catalogBridge.ts', 'utf8')

describe('Catalog bridge new-product persistence regression', () => {
  it('creates a new remote product before syncing its image metadata', () => {
    const skipNewProductImageSync = source.indexOf('if (newProductIds.has(product.id)) continue')
    const replaceSnapshot = source.indexOf('replaceSnapshot({', skipNewProductImageSync)
    const syncNewProducts = source.indexOf('if (!newProductIds.has(product.id)) continue', replaceSnapshot)
    const imageSyncAfterCreate = source.indexOf(
      'syncCatalogProductImagesToRemote(product, workingRevision)',
      syncNewProducts,
    )

    expect(skipNewProductImageSync).toBeGreaterThan(-1)
    expect(replaceSnapshot).toBeGreaterThan(skipNewProductImageSync)
    expect(syncNewProducts).toBeGreaterThan(replaceSnapshot)
    expect(imageSyncAfterCreate).toBeGreaterThan(syncNewProducts)
  })

  it('includes product images in the dirty-state fingerprint', () => {
    expect(source).toContain('productImages: state.products.map')
    expect(source).toContain('hash: productImageHash(product)')
  })
})
