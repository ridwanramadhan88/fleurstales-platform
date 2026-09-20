import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('Catalog scale and Product Editor workflow', () => {
  it('renders Catalog progressively while bulk selection still targets the full filtered result', () => {
    const controller = read('src/components/catalog/CatalogTabContentController.ts')
    const content = read('src/components/catalog/CatalogTabContent.tsx')

    expect(controller).toContain('const CATALOG_INITIAL_VISIBLE_COUNT = 30')
    expect(controller).toContain('const CATALOG_VISIBLE_BATCH_SIZE = 30')
    expect(controller).toContain('const visibleProducts = filteredProducts.slice(0, visibleProductCount)')
    expect(controller).toContain('filteredProducts.forEach((product) => next.add(product.id))')
    expect(content).toContain('visibleProducts.map((product) => (')
    expect(content).toContain('Load more products')
  })

  it('resets progressive Catalog rendering whenever the active discovery context changes', () => {
    const controller = read('src/components/catalog/CatalogTabContentController.ts')

    expect(controller).toContain('setVisibleProductCount(CATALOG_INITIAL_VISIBLE_COUNT)')
    expect(controller).toContain('}, [searchQuery])')
    expect(controller).toContain('onCategoryFilterChange: (value) => {')
    expect(controller).toContain('onSubCategoryFilterChange: (value) => {')
    expect(controller).toContain('onSortOptionChange: (value) => {')
  })

  it('keeps Product Editor actions reachable on phone and marks invalid variants directly', () => {
    const form = read('src/components/catalog/CatalogItemFormSheet.tsx')
    const variants = read('src/components/catalog/CatalogVariantsSection.tsx')

    expect(form).toContain('w-full items-center justify-center')
    expect(form).toContain('sm:w-auto')
    expect(form).toContain('setVariantErrorIndexes(nextVariantErrorIndexes)')
    expect(form).toContain("'catalog-variant-' + variantIndex")
    expect(variants).toContain('validationErrorIndexes.has(variantIndex)')
    expect(variants).toContain('validationErrorIndexes.has(index)')
  })

  it('explains the effective size-template source without changing assignment semantics', () => {
    const form = read('src/components/catalog/CatalogItemFormSheet.tsx')

    expect(form).toContain("'product_override' as const")
    expect(form).toContain("'arrangement_default' as const")
    expect(form).toContain("'new_product_preview' as const")
    expect(form).toContain('Template khusus produk')
    expect(form).toContain('Default Jenis rangkaian')
    expect(form).toContain('tidak akan tersimpan sebagai assignment')
    expect(form).not.toContain('assignSizeGuide(')
  })

  it('keeps single-image Catalog controls explicit and touch-safe', () => {
    const images = read('src/components/catalog/CatalogProductImagesField.tsx')
    const imageDomain = read('src/domain/catalogImageDomain.ts')
    const input = read('src/components/catalog/ImageDropInput.tsx')

    expect(imageDomain).toContain('CATALOG_EDITOR_IMAGE_MAX_COUNT = 1')
    expect(images).toContain('{ordered.length}/{CATALOG_EDITOR_IMAGE_MAX_COUNT}')
    expect(images).toContain('Foto katalog default')
    expect(images).toContain('Foto varian ukuran')
    expect(input).toContain('aria-label={`${label}: pilih atau tarik gambar`}')
    expect(input).toContain('aria-live="assertive"')
  })
})
