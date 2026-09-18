import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCatalogVariantLabel } from '../../domain/catalogVariantLabelDomain'
import { BOUQUET_STANDARD_SIZES } from '../../store/catalogStoreSizeGuideActions'

const catalogDir = join(process.cwd(), 'src/components/catalog')
const detailSource = readFileSync(join(catalogDir, 'CatalogProductDetailSheet.tsx'), 'utf8')
const formSource = readFileSync(join(catalogDir, 'CatalogItemFormSheet.tsx'), 'utf8')
const imagesSource = readFileSync(join(catalogDir, 'CatalogProductImagesField.tsx'), 'utf8')
const variantsSource = readFileSync(join(catalogDir, 'CatalogVariantsSection.tsx'), 'utf8')
const variantEditorSource = readFileSync(join(catalogDir, 'CatalogVariantEditorDialog.tsx'), 'utf8')
const guideSource = readFileSync(join(catalogDir, 'CatalogSizeGuideDialog.tsx'), 'utf8')

describe('catalog size-template and image-carousel regressions', () => {
  it('keeps the canonical Bouquet Standard size list', () => {
    expect(BOUQUET_STANDARD_SIZES.map((item) => item.name)).toEqual(['Small', 'Medium', 'Large'])
  })

  it('uses template-backed size slots without free-text additional options', () => {
    expect(variantsSource).toContain('Belum dikonfigurasi untuk produk ini.')
    expect(variantsSource).toContain('Belum ditautkan ke ukuran')
    expect(variantEditorSource).toContain('Tautkan ke ukuran template · Opsional')
    expect(variantsSource + variantEditorSource).not.toContain('Opsi tambahan · Opsional')
    expect(variantsSource + variantEditorSource).not.toContain('formatCatalogVariantLabel')
    expect(variantsSource + variantEditorSource).not.toContain('getDefaultCatalogSizeGuide')
    expect(formSource).not.toContain('getDefaultCatalogSizeGuide')
  })

  it('supports adding sub-sizes to a template category', () => {
    expect(guideSource).toContain('Template ukuran')
    expect(guideSource).toContain('addSizeGuideTemplateSize')
    expect(guideSource).toContain('Tambah ukuran')
  })

  it('blocks size archive only for sellable linked variants', () => {
    expect(guideSource).toContain('activeSizeUsageCount')
    expect(guideSource).toContain('disabled={activeUsage > 0}')
    expect(guideSource).toContain('varian aktif tidak dapat diarsipkan')
  })

  it('keeps view and edit product photos square and carousel-based', () => {
    expect(detailSource).toContain('aspect-square')
    expect(detailSource).toContain('Product image carousel')
    expect(imagesSource).toContain('Galeri foto produk')
    expect(imagesSource).toContain('Foto produk sebelumnya')
    expect(imagesSource).toContain('Foto produk berikutnya')
  })

  it('still parses historical labels without exposing a new option editor', () => {
    expect(parseCatalogVariantLabel('Medium · Blue')).toEqual({ size: 'Medium', option: 'Blue' })
    expect(variantsSource + variantEditorSource).not.toContain('Opsi tambahan')
  })

  it('gates Catalog cost fields to owner or finance roles', () => {
    expect(variantEditorSource).toContain("role === 'owner' || role === 'finance'")
    expect(detailSource).toContain("userRole === 'owner' || userRole === 'finance'")
    expect(detailSource).toContain('canViewCost && variant.cost !== undefined')
  })
})
