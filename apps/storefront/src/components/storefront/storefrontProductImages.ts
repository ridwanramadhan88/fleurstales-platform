import type { CatalogProduct } from '../../store/catalogStoreTypes'
import {
  getCatalogProductImageUrls,
  getCatalogProductPrimaryImageUrl,
} from '../../domain/catalogImageDomain'
/** Storefront media comes only from the canonical product-image records. */
export const getStorefrontProductThumbnail = (product: CatalogProduct): string =>
  getCatalogProductPrimaryImageUrl(product) ?? ''

export const getStorefrontProductGallery = (product: CatalogProduct): string[] => {
  const canonical = getCatalogProductImageUrls(product)
  return canonical
}

export const getStorefrontProductThumbnailById = (
  products: CatalogProduct[],
  productId: string,
): string => {
  const product = products.find((item) => item.id === productId)
  return product ? getStorefrontProductThumbnail(product) : ''
}
