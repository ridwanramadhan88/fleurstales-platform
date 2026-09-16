import type { CatalogProduct, CatalogVariant } from '../../store/catalogStoreTypes'
import { getCatalogProductImageUrls } from '../../domain/catalogImageDomain'

const getVariantImageUrls = (variant?: CatalogVariant): string[] => {
  if (!variant?.images?.length) return []
  return [...variant.images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image) => image.url)
    .filter((url): url is string => Boolean(url?.trim()))
}

export const getStorefrontProductGallery = (product: CatalogProduct): string[] =>
  getCatalogProductImageUrls(product)

/**
 * Customer-facing gallery for a concrete sellable variant. Variant photos are
 * authoritative when present; legacy/base product photos remain the fallback
 * for products that have not been migrated yet.
 */
export const getStorefrontVariantGallery = (
  product: CatalogProduct,
  variant?: CatalogVariant,
): string[] => {
  const variantImages = getVariantImageUrls(variant)
  return variantImages.length > 0 ? variantImages : getStorefrontProductGallery(product)
}

export const getStorefrontPrimaryImage = (product: CatalogProduct): string | undefined =>
  getStorefrontProductGallery(product)[0]

export const getStorefrontVariantPrimaryImage = (
  product: CatalogProduct,
  variant?: CatalogVariant,
): string | undefined => getStorefrontVariantGallery(product, variant)[0]
