import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const formSource = readFileSync('src/components/catalog/CatalogItemFormSheet.tsx', 'utf8')
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

  it('renders template slots without materializing missing variants', () => {
    expect(variantsSource).toContain('Belum dikonfigurasi untuk produk ini.')
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

  it('uses Indonesian Product Editor image controls', () => {
    expect(imageFieldSource).toContain('Foto utama produk')
    expect(imageFieldSource).toContain('Galeri foto produk')
    expect(imageDropSource).toContain('Tarik & lepas gambar')
    expect(imageDropSource).toContain('Terapkan potongan')
    expect(imageDropSource).not.toContain('Apply crop')
  })
})
