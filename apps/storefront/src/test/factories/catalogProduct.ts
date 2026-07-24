import type { CatalogProduct, CatalogVariant } from '../../store/catalogStoreTypes'

export const makeVariant = (overrides: Partial<CatalogVariant> = {}): CatalogVariant => ({
  id: 'variant_1',
  sku: 'BOQ-FRE-RSB-05R-001',
  size: '05R',
  price: 150_000,
  status: 'active',
  ...overrides,
})

export const makeCatalogProduct = (
  overrides: Partial<CatalogProduct> = {},
): CatalogProduct => ({
  id: 'product_1',
  productId: 'BOQ-000001',
  category: 'Bouquet',
  material: 'fresh',
  name: 'Rose Bouquet',
  variants: [makeVariant()],
  isActive: true,
  ...overrides,
})
