import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const bridgeSource = readFileSync('src/data/shared/catalogBridge.ts', 'utf8')
const formSource = readFileSync('src/components/catalog/CatalogItemFormSheet.tsx', 'utf8')
const controllerSource = readFileSync('src/components/catalog/CatalogTabContentController.ts', 'utf8')
const variantEditorSource = readFileSync('src/components/catalog/CatalogVariantEditorDialog.tsx', 'utf8')
const migrationSource = readFileSync('../../supabase/migrations/20260919130000_catalog_product_editor_atomic_save.sql', 'utf8')

describe('Catalog product editor persistence regressions', () => {
  it('uploads new image binaries before the single revision-guarded Catalog snapshot commit', () => {
    const pendingUploads = bridgeSource.indexOf('for (const upload of plan.pendingUploads)')
    const uploadObject = bridgeSource.indexOf('uploadProductImage({', pendingUploads)
    const replaceSnapshot = bridgeSource.indexOf('replaceSnapshot({', uploadObject)

    expect(pendingUploads).toBeGreaterThan(-1)
    expect(uploadObject).toBeGreaterThan(pendingUploads)
    expect(replaceSnapshot).toBeGreaterThan(uploadObject)
    expect(bridgeSource).not.toContain('replaceFlowerRecipes({')
    expect(bridgeSource).not.toContain('replaceProductImagesMetadata({')
  })

  it('cleans pre-uploaded objects when the atomic database commit fails', () => {
    expect(bridgeSource).toContain('if (!catalogCommitted && uploadedPaths.length > 0)')
    expect(bridgeSource).toContain('removeProductImageObjects(uploadedPaths)')
  })

  it('commits variants, recipes, and image metadata in one database revision', () => {
    expect(migrationSource).toContain('delete from public.product_variant_flower_recipes')
    expect(migrationSource).toContain('insert into public.product_variant_flower_recipes')
    expect(migrationSource).toContain('delete from public.product_images where product_id=v_product_id')
    expect(migrationSource).toContain('insert into public.product_images')
    expect(migrationSource).toContain('v_next_revision := v_current_revision+1')
  })

  it('keeps product form and nested variant edits as local drafts until explicit save/apply', () => {
    expect(formSource).toContain('Data baru tersimpan saat tombol Simpan dipilih.')
    expect(formSource).toContain('await onUpdate({ productId: product.id, ...common })')
    expect(variantEditorSource).toContain('hanya masuk ke draft produk setelah memilih Terapkan')
    expect(variantEditorSource).toContain('>Terapkan<')
  })

  it('waits for remote persistence and restores the store after a failed editor save', () => {
    expect(controllerSource).toContain('const saved = await flushBusinessOsCatalogSync()')
    expect(controllerSource).toContain('useCatalogStore.setState({ products: previousProducts })')
    expect(controllerSource).toContain('return false')
  })

  it('keeps normal Catalog edits and image edits in the dirty-state fingerprint', () => {
    expect(bridgeSource).toContain('...buildRemoteSnapshot(state)')
    expect(bridgeSource).toContain('productImages: state.products.map')
    expect(bridgeSource).toContain('hash: productImageHash(product)')
  })
})
