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
  if (
    params.status === 'inactive' &&
    product.isActive &&
    variant.status === 'active' &&
    product.variants.filter((item) => item.status === 'active').length <= 1
  ) {
    return { ok: false, reason: 'An active product must keep at least one sellable variant.' }
  }
  return { ok: true }
}
