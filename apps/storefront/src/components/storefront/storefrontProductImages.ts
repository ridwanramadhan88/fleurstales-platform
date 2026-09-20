import type { CatalogProduct, CatalogVariant } from '../../store/catalogStoreTypes'
import { getCatalogProductImageUrls } from '../../domain/catalogImageDomain'

const getVariantImageUrls = (variant?: CatalogVariant): string[] => {
  if (!variant?.images?.length) return []
  return [...variant.images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image) => image.url)
    .filter((url): url is string => Boolean(url?.trim()))
}

export interface StorefrontProductDetailGalleryItem {
  url: string
  kind: 'catalog' | 'variant'
  variantId?: string
  size?: string
}

export const getStorefrontProductGallery = (product: CatalogProduct): string[] =>
  getCatalogProductImageUrls(product)

/**
 * Dedicated product-detail gallery.
 *
 * New Catalog ownership uses one default Catalog photo plus one photo per size
 * variant. The default Catalog photo is always first. Variant items retain
 * their variant identity so gallery navigation can update the size picker.
 */
export const getStorefrontProductDetailGallery = (
  product: CatalogProduct,
): StorefrontProductDetailGalleryItem[] => {
  const items: StorefrontProductDetailGalleryItem[] = []
  const catalogImage = getStorefrontProductGallery(product)[0]

  if (catalogImage) {
    items.push({ url: catalogImage, kind: 'catalog' })
  }

  for (const variant of product.variants) {
    if (variant.status !== 'active') continue
    const variantImage = getVariantImageUrls(variant)[0]
    if (!variantImage) continue
    items.push({
      url: variantImage,
      kind: 'variant',
      variantId: variant.id,
      size: variant.size,
    })
  }

  return items
}

/**
 * Customer-facing image for a concrete sellable variant. Variant photos are
 * authoritative when present; the Catalog default photo remains the fallback
 * for legacy products or variants that do not yet have a dedicated photo.
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

/**
 * Backward-compatible product thumbnail helpers used by cards/cart surfaces.
 * These intentionally resolve the canonical/base product image; variant-aware
 * surfaces should use getStorefrontVariantPrimaryImage instead.
 */
export const getStorefrontProductThumbnail = (product: CatalogProduct): string =>
  getStorefrontPrimaryImage(product) ?? ''

export const getStorefrontProductThumbnailById = (
  products: CatalogProduct[],
  productId: string,
): string => {
  const product = products.find((item) => item.id === productId)
  return product ? getStorefrontProductThumbnail(product) : ''
}

export const getStorefrontCartLineImage = (
  products: CatalogProduct[],
  productId: string,
  variantId?: string,
): string => {
  const product = products.find((item) => item.id === productId)
  if (!product) return ''
  const variant = variantId
    ? product.variants.find((item) => item.id === variantId)
    : undefined
  return getStorefrontVariantPrimaryImage(product, variant)
    ?? getStorefrontProductThumbnail(product)
}
