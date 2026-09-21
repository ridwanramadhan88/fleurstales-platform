import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const formSource = readFileSync('src/components/catalog/CatalogItemFormSheet.tsx', 'utf8')
const detailsSource = readFileSync('src/components/catalog/CatalogProductDetailsSection.tsx', 'utf8')
const variantsSource = readFileSync('src/components/catalog/CatalogVariantsSection.tsx', 'utf8')
const variantDialogSource = readFileSync('src/components/catalog/CatalogVariantEditorDialog.tsx', 'utf8')
const controllerSource = readFileSync('src/components/catalog/CatalogTabContentController.ts', 'utf8')
const tabContentSource = readFileSync('src/components/catalog/CatalogTabContent.tsx', 'utf8')
const imageFieldSource = readFileSync('src/components/catalog/CatalogProductImagesField.tsx', 'utf8')
const imageDropSource = readFileSync('src/components/catalog/ImageDropInput.tsx', 'utf8')

describe('Catalog Product Editor UX regressions', () => {
  it('uses separate Product Information and Variant & Size draft tabs with dirty indicators', () => {
    expect(formSource).toContain('Informasi Produk')
    expect(formSource).toContain('Varian & Ukuran')
    expect(formSource).toContain('const infoDirty =')
    expect(formSource).toContain('const variantsDirty =')
    expect(formSource).toContain('Belum disimpan')
  })

  it('guards unsaved drafts on close and browser navigation', () => {
    expect(formSource).toContain("window.addEventListener('beforeunload'")
    expect(formSource).toContain('title="Buang perubahan?"')
    expect(formSource).toContain('cancelLabel="Lanjut edit"')
  })

  it('keeps a live source reference only for stale-editor detection and never overwrites the form draft', () => {
    expect(controllerSource).toContain('const sheetProduct =')
    expect(tabContentSource).toContain('product={sheetProduct}')
    expect(formSource).toContain('const sourceChanged =')
    expect(formSource).toContain('Draft ini tidak ditimpa otomatis')
    expect(formSource).toContain('disabled={isSaving || sourceChanged}')
  })

  it('makes the only usable size template available as a clearly non-persisted new Product preview', () => {
    expect(formSource).toContain('usableSizeTemplates.length === 1')
    expect(formSource).toContain('Template ukuran tersedia, tetapi belum ditetapkan')
    expect(formSource).toContain("'new_product_preview' as const")
    expect(formSource).toContain('Pratinjau produk baru')
    expect(formSource).toContain('belum ditetapkan dan tidak akan tersimpan sebagai assignment')
  })

  it('marks required Product fields inline and lets the error summary navigate to them', () => {
    expect(detailsSource).toContain('aria-invalid={Boolean(fieldErrors.name)}')
    expect(detailsSource).toContain('catalog-product-name-error')
    expect(detailsSource).toContain('catalog-product-category-error')
    expect(detailsSource).toContain('catalog-product-type-error')
    expect(formSource).toContain('summaryRef={validationSummaryRef}')
    expect(formSource).toContain('focusValidationIssue')
    expect(formSource).toContain("id: variantIndex !== null && variantIndex >= 0")
    expect(formSource).toContain('scrollIntoView')
    expect(formSource).toContain('id="catalog-variants-section"')
    expect(variantsSource).toContain('id={configured && variantIndex !== undefined ? `catalog-variant-${variantIndex}` : undefined}')
    expect(variantsSource).toContain('validationErrorIndexes.has(index)')
  })

  it('lets each product explicitly choose only the template sizes it owns', () => {
    expect(variantsSource).toContain('Ukuran yang tidak ditambahkan tidak akan muncul di Storefront.')
    expect(variantsSource).toContain('Tambahkan ke produk')
    expect(variantsSource).toContain('Dipakai produk')
    expect(variantsSource).toContain('Tidak dipakai')
    expect(variantsSource).toContain('removeVariant(variantIndex)')
    expect(variantsSource).toContain('openNewForSize')
    expect(variantsSource).toContain('if (editorTarget.index === null) addVariant(next)')
    expect(variantsSource).toContain('Belum ditautkan ke ukuran')
  })

  it('keeps the nested variant editor full-screen on mobile with Detail Foto Resep tabs', () => {
    expect(variantDialogSource).toContain('h-[100dvh] max-h-[100dvh]')
    expect(variantDialogSource).toContain('<TabsTrigger value="detail">Detail</TabsTrigger>')
    expect(variantDialogSource).toContain('<TabsTrigger value="foto">Foto</TabsTrigger>')
    expect(variantDialogSource).toContain('<TabsTrigger value="resep">Resep</TabsTrigger>')
    expect(variantDialogSource).toContain('pb-[max(1.25rem,env(safe-area-inset-bottom))]')
  })

  it('keeps Size Guide reference-only inside a Product variant', () => {
    expect(variantDialogSource).toContain('Referensi saja.')
    expect(variantDialogSource).toContain('tidak dapat diedit dari produk')
    expect(variantDialogSource).not.toContain('updateSizeGuideTemplateSize')
  })

  it('separates one catalog-default photo from one photo per size variant', () => {
    expect(imageFieldSource).toContain("kind?: 'catalog' | 'variant'")
    expect(imageFieldSource).toContain("const inputLabel = isVariant ? 'Foto varian ukuran' : 'Foto katalog default'")
    expect(imageFieldSource).toContain('Maksimal 1 foto untuk ukuran ini.')
    expect(imageFieldSource).toContain('Ini menjadi foto default katalog')
    expect(variantDialogSource).toContain('kind="variant"')
    expect(detailsSource).toContain('kind="catalog"')
    expect(imageDropSource).toContain('Tarik & lepas gambar')
    expect(imageDropSource).toContain('Terapkan potongan')
    expect(imageDropSource).not.toContain('Apply crop')
  })

  it('keeps photo and flower recipe owned by the selected size variant', () => {
    expect(variantDialogSource).toContain('Resep bunga ukuran ini')
    expect(variantDialogSource).toContain('Resep tersimpan khusus untuk ukuran ini')
    expect(variantDialogSource).toContain('Foto ini akan dipakai saat ukuran ini dipilih di Storefront')
  })

  it('requires complete Storefront data for every active size variant before save', () => {
    expect(variantDialogSource).toContain('Varian aktif wajib memiliki tepat 1 foto ukuran.')
    expect(variantDialogSource).toContain('Varian aktif wajib memiliki minimal 1 item Resep Bunga.')
    expect(variantDialogSource).toContain('Varian aktif harus memakai ukuran dari Size Template.')
    expect(variantDialogSource).toContain("setTab('foto')")
    expect(variantDialogSource).toContain("setTab('resep')")
    expect(formSource).toContain('Foto katalog default wajib diisi untuk produk aktif.')
    expect(formSource).toContain("row.status === 'active' && row.images.length !== 1")
    expect(formSource).toContain("row.status === 'active' && row.flowerRecipe.length === 0")
  })

  it('does not create new free-text unlinked variants while preserving legacy unlinked review', () => {
    expect(variantsSource).not.toContain('openNewUnlinked')
    expect(variantsSource).not.toContain('Varian tanpa tautan ukuran')
    expect(variantsSource).toContain('Buat atau tetapkan Size Template terlebih dahulu sebelum menambahkan varian baru.')
    expect(variantsSource).toContain('Belum ditautkan ke ukuran')
    expect(variantsSource).toContain('Tinjau & tautkan')
  })
})
