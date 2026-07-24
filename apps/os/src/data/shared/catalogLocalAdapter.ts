/**
 * Canonical local Catalog adapter used by Phase 10 export/import QA.
 * Unlike the remote Catalog sync snapshot, this representation includes the
 * ordered image metadata so one portable bundle can describe the complete
 * shared Catalog domain.
 */
import { useCatalogStore } from '../../store/catalogStore'
import type {
  CatalogCategoryConfig,
  CatalogProduct,
  CatalogProductImage,
  CatalogStoreState,
} from '../../store/catalogStoreTypes'
import type { SharedOccasion, SharedProduct } from './contracts'
import type { SharedCatalogSnapshot } from './sharedDataBundleTypes'


const unique = <T,>(items: T[]): T[] => [...new Set(items)]

const normalizeImage = (
  product: CatalogProduct,
  image: CatalogProductImage,
  index: number,
): SharedProduct['images'][number] => {
  const mimeType = image.mimeType ?? 'image/jpeg'
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'
  const storagePath = image.storagePath?.trim()
    || `local/${product.id}/${image.id}.${extension}`
  return {
    id: image.id,
    productId: product.id,
    storagePath,
    publicUrl: image.url,
    altText: image.altText,
    sortOrder: index,
    isPrimary: index === 0,
    mimeType,
    byteSize: image.byteSize,
    width: image.width,
    height: image.height,
  }
}

export const catalogStateToSharedSnapshot = (
  state: Pick<CatalogStoreState, 'categories' | 'products' | 'deletedProductIds'>,
  revision = 0,
): SharedCatalogSnapshot => {
  const occasionByName = new Map(state.categories.map((category) => [category.name, category]))
  const occasions: SharedOccasion[] = state.categories.map((category, index) => ({
    id: category.id,
    name: category.name,
    prefix: category.prefix,
    sortOrder: index,
    isActive: true,
  }))

  const products: SharedProduct[] = state.products.map((product, productIndex) => {
    const primary = occasionByName.get(product.category)
    const occasionIds = unique([product.category, ...(product.occasionTags ?? [])])
      .map((name) => occasionByName.get(name)?.id)
      .filter((id): id is string => Boolean(id))
    if (primary && !occasionIds.includes(primary.id)) occasionIds.unshift(primary.id)

    const canonicalImages = product.images?.length
      ? [...product.images].sort((a, b) => a.sortOrder - b.sortOrder)
      : unique([product.thumbnail, ...(product.gallery ?? [])].filter((url): url is string => Boolean(url)))
          .map((url, index): CatalogProductImage => ({
            id: `${product.id}-legacy-image-${index + 1}`,
            url,
            sortOrder: index,
            isPrimary: index === 0,
            mimeType: 'image/jpeg',
          }))

    return {
      id: product.id,
      productCode: product.productId,
      primaryOccasionId: primary?.id,
      occasionIds,
      material: product.material,
      name: product.name,
      description: product.description,
      productType: product.productType,
      collectionSeries: product.collectionSeries,
      pricingType: product.pricingType,
      orderType: product.orderType,
      isFeatured: product.isFeatured === true,
      isActive: product.isActive,
      promoLabel: product.promoLabel,
      originalPriceIdr: product.originalPriceIdr,
      isCustomizable: product.isCustomizable === true,
      sortOrder: productIndex,
      variants: product.variants.map((variant, variantIndex) => ({
        id: variant.id,
        productId: product.id,
        sku: variant.sku,
        size: variant.size,
        priceIdr: variant.price,
        status: variant.status,
        sortOrder: variantIndex,
        ...(variant.cost !== undefined ? { costIdr: variant.cost } : {}),
      })),
      images: canonicalImages.map((image, index) => normalizeImage(product, image, index)),
    }
  })

  return {
    adminState: {
      revision,
      deletedProductCodes: [...state.deletedProductIds],
    },
    occasions,
    products,
  }
}

const sharedImagesToLocal = (product: SharedProduct): CatalogProductImage[] =>
  [...product.images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((image, index) => ({
      id: image.id,
      url: image.publicUrl,
      storagePath: image.storagePath,
      altText: image.altText,
      sortOrder: index,
      isPrimary: index === 0,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
    }))

export const sharedCatalogSnapshotToLocalState = (
  snapshot: SharedCatalogSnapshot,
): Pick<CatalogStoreState, 'categories' | 'products' | 'deletedProductIds'> => {
  const occasionById = new Map(snapshot.occasions.map((occasion) => [occasion.id, occasion]))
  const categories: CatalogCategoryConfig[] = [...snapshot.occasions]
    .filter((occasion) => occasion.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((occasion) => ({ id: occasion.id, name: occasion.name, prefix: occasion.prefix }))

  const products: CatalogProduct[] = [...snapshot.products]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((product) => {
      const linkedNames = product.occasionIds
        .map((id) => occasionById.get(id)?.name)
        .filter((name): name is string => Boolean(name))
      const primaryName = product.primaryOccasionId
        ? occasionById.get(product.primaryOccasionId)?.name
        : undefined
      const category = primaryName ?? linkedNames[0] ?? 'Uncategorized'
      const images = sharedImagesToLocal(product)
      const imageUrls = images.map((image) => image.url)

      return {
        id: product.id,
        productId: product.productCode,
        category,
        occasionTags: unique([category, ...linkedNames]),
        productType: product.productType,
        collectionSeries: product.collectionSeries,
        pricingType: product.pricingType,
        orderType: product.orderType,
        material: product.material,
        name: product.name,
        description: product.description,
        images,
        ...(imageUrls[0] ? { thumbnail: imageUrls[0] } : {}),
        ...(imageUrls.length ? { gallery: imageUrls } : {}),
        variants: [...product.variants]
          .sort((a, b) => a.sortOrder - b.sortOrder || a.sku.localeCompare(b.sku))
          .map((variant) => ({
            id: variant.id,
            sku: variant.sku,
            size: variant.size,
            price: variant.priceIdr,
            ...(variant.costIdr !== undefined && variant.costIdr !== null ? { cost: variant.costIdr } : {}),
            status: variant.status,
          })),
        isFeatured: product.isFeatured,
        isActive: product.isActive,
        promoLabel: product.promoLabel,
        originalPriceIdr: product.originalPriceIdr,
        isCustomizable: product.isCustomizable,
      }
    })

  return {
    categories,
    products,
    deletedProductIds: [...snapshot.adminState.deletedProductCodes],
  }
}

export const getLocalSharedCatalogSnapshot = (revision = 0): SharedCatalogSnapshot =>
  catalogStateToSharedSnapshot(useCatalogStore.getState(), revision)

export const applySharedCatalogSnapshotToLocalState = (snapshot: SharedCatalogSnapshot): void => {
  const mapped = sharedCatalogSnapshotToLocalState(snapshot)
  useCatalogStore.setState(mapped)
}
