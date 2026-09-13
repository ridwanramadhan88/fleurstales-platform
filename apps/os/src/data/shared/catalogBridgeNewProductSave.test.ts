import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bridgeSource = readFileSync('src/data/shared/catalogBridge.ts', 'utf8')
const formSource = readFileSync('src/components/catalog/CatalogItemFormSheet.tsx', 'utf8')
const controllerSource = readFileSync('src/components/catalog/CatalogTabContentController.ts', 'utf8')

describe('Catalog product persistence regressions', () => {
  it('creates a new remote product before syncing its image metadata', () => {
    const skipNewProductImageSync = bridgeSource.indexOf('if (newProductIds.has(product.id)) continue')
    const replaceSnapshot = bridgeSource.indexOf('replaceSnapshot({', skipNewProductImageSync)
    const syncNewProducts = bridgeSource.indexOf('if (!newProductIds.has(product.id)) continue', replaceSnapshot)
    const imageSyncAfterCreate = bridgeSource.indexOf(
      'syncCatalogProductImagesToRemote(product, workingRevision)',
      syncNewProducts,
    )

    expect(skipNewProductImageSync).toBeGreaterThan(-1)
    expect(replaceSnapshot).toBeGreaterThan(skipNewProductImageSync)
    expect(syncNewProducts).toBeGreaterThan(replaceSnapshot)
    expect(imageSyncAfterCreate).toBeGreaterThan(syncNewProducts)
  })

  it('keeps normal catalog edits and image-only edits in the dirty-state fingerprint', () => {
    expect(bridgeSource).toContain('...buildRemoteSnapshot(state)')
    expect(bridgeSource).toContain('productImages: state.products.map')
    expect(bridgeSource).toContain('hash: productImageHash(product)')
  })

  it('syncs changed images for an existing product before replacing the catalog snapshot', () => {
    const skipNewProducts = bridgeSource.indexOf('if (newProductIds.has(product.id)) continue')
    const imageSync = bridgeSource.indexOf(
      'syncCatalogProductImagesToRemote(product, workingRevision)',
      skipNewProducts,
    )
    const replaceSnapshot = bridgeSource.indexOf('replaceSnapshot({', imageSync)

    expect(skipNewProducts).toBeGreaterThan(-1)
    expect(imageSync).toBeGreaterThan(skipNewProducts)
    expect(replaceSnapshot).toBeGreaterThan(imageSync)
  })

  it('submits edited details, variants, and carousel images through the update path', () => {
    expect(formSource).toContain('images: normalizedImages')
    expect(formSource).toContain('variants: parsedVariants')
    expect(formSource).toContain('onUpdate({ productId: product.id, ...common })')
    expect(controllerSource).toContain('updateProduct(productId, patch)')
  })

  it('persists edited variant status through the guarded status action', () => {
    expect(controllerSource).toContain('previous.status !== variant.status')
    expect(controllerSource).toContain('setCatalogVariantStatus({ productId, variantId: variant.id, status: variant.status, role: userRole })')
  })
})
