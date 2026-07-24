import type { CatalogProduct } from '../../store/catalogStoreTypes'
import {
  getCatalogProductImageUrls,
  getCatalogProductPrimaryImageUrl,
} from '../../domain/catalogImageDomain'
import { getStorefrontDummyGallery, getStorefrontDummyThumbnail } from './storefrontDummyImages'

/** Canonical product media wins; bundled photography is only a visual fallback. */
export const getStorefrontProductThumbnail = (product: CatalogProduct): string =>
  getCatalogProductPrimaryImageUrl(product) ?? getStorefrontDummyThumbnail(product.id)

export const getStorefrontProductGallery = (product: CatalogProduct): string[] => {
  const canonical = getCatalogProductImageUrls(product)
  return canonical.length > 0 ? canonical : getStorefrontDummyGallery(product.id)
}

export const getStorefrontProductThumbnailById = (
  products: CatalogProduct[],
  productId: string,
): string => {
  const product = products.find((item) => item.id === productId)
  return product ? getStorefrontProductThumbnail(product) : getStorefrontDummyThumbnail(productId)
}
