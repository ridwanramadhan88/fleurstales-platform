import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Catalog cleanup regressions', () => {
  it('keeps the Product form wide, labeled and essential-only', () => {
    const form = read('src/components/catalog/CatalogItemFormSheet.tsx')
    const details = read('src/components/catalog/CatalogProductDetailsSection.tsx')
    const images = read('src/components/catalog/CatalogProductImagesField.tsx')
    const variants = read('src/components/catalog/CatalogVariantsSection.tsx')

    expect(form).toContain('size="workspace"')
    expect(form).toContain('h-[100dvh]')
    expect(form).toContain('title="Informasi produk"')
    expect(form).toContain('title="Varian & ukuran"')
    expect(form).toContain('Informasi Produk')
    expect(form).toContain('Varian & Ukuran')
    expect(form).not.toContain('Advanced setup')
    expect(form).not.toContain('CatalogRecipeSection')
    expect(form).not.toContain('CatalogPromoSection')

    expect(details).toContain('Nama produk · Wajib')
    expect(details).toContain('Occasion utama · Wajib')
    expect(details).toContain('Jenis rangkaian · Wajib')
    expect(details).toContain('Ketersediaan · Wajib')
    expect(details).toContain('CatalogProductImagesField')
    expect(images).toContain('Foto utama produk')

    expect(variants).toContain('Varian berdasarkan ukuran')
    expect(variants).toContain('Belum ditautkan ke ukuran')
    expect(variants).toContain('Atur varian')
    expect(variants).not.toContain('Opsi tambahan')
  })

  it('uses dynamic underline category tabs and direct Catalog actions', () => {
    const filters = read('src/components/catalog/CatalogFiltersBar.tsx')
    const row = read('src/components/catalog/CatalogProductRow.tsx')

    expect(filters).toContain("const categories: CatalogCategoryFilter[] = ['all', ...availableCategories]")
    expect(filters).toContain('border-b-2')
    expect(filters).toContain('overflow-x-auto')
    expect(filters).not.toContain('FilterChip')

    expect(row).toContain('Edit product')
    expect(row).toContain('Mark as featured')
    expect(row).toContain('Manage promotion')
    expect(row).toContain('Archive product')
  })

  it('keeps occasion management readable and explains blocked deletion', () => {
    const categories = read('src/components/catalog/CatalogCategoriesDialog.tsx')
    const bulk = read('src/components/product/BulkActionBar.tsx')

    expect(categories).toContain('max-w-2xl')
    expect(categories).toContain('grid-rows-[auto_minmax(0,1fr)_auto]')
    expect(categories).toContain('Occasion name · Required')
    expect(categories).toContain('SKU prefix · Required')
    expect(categories).toContain('active product')
    expect(categories).toContain('PopoverContent')
    expect(categories).toContain('Uncategorized is the protected fallback occasion')

    expect(bulk).toContain('sticky top-2')
    expect(bulk).toContain('bg-card')
    expect(bulk).toContain('text-foreground')
    expect(bulk).toContain('bg-destructive')
    expect(bulk).not.toContain('text-white/70')
  })

  it('removes Catalog recipe implementation and migrates legacy data away', () => {
    const types = read('src/store/catalogStoreTypes.ts')
    const persistence = read('src/store/operationalPersistence.ts')

    expect(types).not.toContain('CatalogRecipeItem')
    expect(types).not.toContain('linkedStockItemIds?:')
    expect(types).not.toContain('recipe?:')
    expect(persistence).toContain('migrate18to19')
    expect(persistence).toContain('delete next.recipe')
    expect(persistence).toContain('delete stock.reservations')
    expect(existsSync('src/core/events/orderInventorySync.ts')).toBe(false)
    expect(existsSync('src/store/stockStoreReservationActions.ts')).toBe(false)
  })
})
