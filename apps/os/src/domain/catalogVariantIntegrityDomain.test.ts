import { describe, expect, it } from 'vitest'
import type { CatalogProduct, CatalogSizeGuideTemplate } from '../store/catalogStoreTypes'
import { auditCatalogVariantIntegrity } from './catalogVariantIntegrityDomain'

const makeProduct = (patch: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: 'product-1',
  productId: 'BOUQ-001',
  category: 'Bouquet',
  productType: 'Bouquet',
  material: 'fresh',
  name: 'Classic Rose Bouquet',
  images: [{
    id: 'base-image',
    url: 'https://example.test/base.jpg',
    sortOrder: 0,
    isPrimary: true,
  }],
  variants: [],
  isActive: true,
  ...patch,
})

const template: CatalogSizeGuideTemplate = {
  id: 'bouquet-standard',
  name: 'Bouquet Standard',
  imageUrl: '',
  byteSize: 0,
  width: 800,
  height: 800,
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
  sizes: [
    { id: 'small', name: 'Small', isActive: true },
    { id: 'medium', name: 'Medium', isActive: true },
    { id: 'large', name: 'Large', isActive: false },
  ],
}

const assignedTargets = [{
  id: 'target-bouquet',
  templateId: template.id,
  scope: 'product_type' as const,
  productType: 'Bouquet',
}]

describe('catalog variant integrity audit', () => {
  it('returns clean results for fully migrated variants', () => {
    const product = makeProduct({
      variants: [{
        id: 'variant-small',
        sku: 'BOUQ-001-S',
        sizeOptionId: 'small',
        size: 'Small',
        price: 150000,
        status: 'active',
        images: [{ id: 'small-image', url: 'https://example.test/small.jpg', sortOrder: 0, isPrimary: true }],
        flowerRecipe: [{ id: 'rose-small', flowerName: 'Red rose', quantity: 10, unit: 'stem' }],
      }],
    })

    const report = auditCatalogVariantIntegrity([product], [template], assignedTargets)

    expect(report.errors).toBe(0)
    expect(report.warnings).toBe(0)
    expect(report.checkedVariants).toBe(1)
  })

  it('flags duplicate, unknown and archived active size identities', () => {
    const product = makeProduct({
      variants: [
        {
          id: 'variant-small-a',
          sku: 'BOUQ-001-S1',
          sizeOptionId: 'small',
          size: 'Small',
          price: 150000,
          status: 'inactive',
        },
        {
          id: 'variant-small-b',
          sku: 'BOUQ-001-S2',
          sizeOptionId: 'small',
          size: 'Small duplicate',
          price: 160000,
          status: 'inactive',
        },
        {
          id: 'variant-xl',
          sku: 'BOUQ-001-XL',
          sizeOptionId: 'xl',
          size: 'XL',
          price: 300000,
          status: 'inactive',
        },
        {
          id: 'variant-large',
          sku: 'BOUQ-001-L',
          sizeOptionId: 'large',
          size: 'Large',
          price: 275000,
          status: 'active',
          images: [{ id: 'large-image', url: 'https://example.test/large.jpg', sortOrder: 0, isPrimary: true }],
          flowerRecipe: [{ id: 'rose-large', flowerName: 'Red rose', quantity: 22, unit: 'stem' }],
        },
      ],
    })

    const report = auditCatalogVariantIntegrity([product], [template], assignedTargets)
    const codes = report.issues.map((issue) => issue.code)

    expect(codes).toContain('duplicate_size_option')
    expect(codes).toContain('unknown_size_option')
    expect(codes).toContain('archived_size_option')
    expect(report.errors).toBe(3)
  })

  it('allows the same size option when the manual option is different', () => {
    const product = makeProduct({
      variants: [
        {
          id: 'variant-medium-white',
          sku: 'BOUQ-001-M-WHITE',
          sizeOptionId: 'medium',
          size: 'Medium · White',
          price: 200000,
          status: 'inactive',
        },
        {
          id: 'variant-medium-pink',
          sku: 'BOUQ-001-M-PINK',
          sizeOptionId: 'medium',
          size: 'Medium · Pink',
          price: 210000,
          status: 'inactive',
        },
      ],
    })

    const report = auditCatalogVariantIntegrity([product], [template], assignedTargets)
    expect(report.issues.map((issue) => issue.code)).not.toContain('duplicate_size_option')
  })

  it('keeps legacy fallbacks visible as warnings instead of destructive failures', () => {
    const product = makeProduct({
      variants: [{
        id: 'variant-legacy',
        sku: 'BOUQ-001-OLD',
        size: 'Medium',
        price: 250000,
        status: 'active',
      }],
    })

    const report = auditCatalogVariantIntegrity([product], [template], assignedTargets)
    const codes = report.issues.map((issue) => issue.code)

    expect(codes).toEqual(expect.arrayContaining([
      'missing_size_option',
      'missing_recipe',
      'missing_variant_image',
    ]))
    expect(report.errors).toBe(0)
  })

  it('flags orphaned size-guide assignments', () => {
    const report = auditCatalogVariantIntegrity(
      [makeProduct()],
      [template],
      [
        { id: 'missing-template', templateId: 'does-not-exist', scope: 'product_type', productType: 'Bouquet' },
        { id: 'missing-product', templateId: template.id, scope: 'product', productId: 'does-not-exist' },
      ],
    )

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'orphaned_template_target', severity: 'error' }),
      expect.objectContaining({ code: 'orphaned_product_target', severity: 'warning' }),
    ]))
  })
})
