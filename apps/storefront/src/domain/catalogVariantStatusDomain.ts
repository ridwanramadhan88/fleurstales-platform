import type { CatalogProduct, CatalogVariantStatus } from '../store/catalogStoreTypes'
import type { UserRole } from '../store/userStore'
export type CatalogVariantStatusResult = { ok: true } | { ok: false; reason: string }
export const canSetCatalogVariantStatus = (params: { products: CatalogProduct[]; productId: string; variantId: string; status: CatalogVariantStatus; role: UserRole }): CatalogVariantStatusResult => {
  if (params.role !== 'owner' && params.role !== 'admin') return { ok: false, reason: 'Catalog edit permission required.' }
  const product = params.products.find((item) => item.id === params.productId)
  if (!product) return { ok: false, reason: 'Product not found.' }
  const variant = product.variants.find((item) => item.id === params.variantId)
  if (!variant) return { ok: false, reason: 'Variant not found.' }
  if (variant.status === params.status) return { ok: false, reason: 'Variant already has that status.' }
  return { ok: true }
}
