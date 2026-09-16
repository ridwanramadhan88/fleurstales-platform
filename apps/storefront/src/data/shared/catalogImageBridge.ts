import './catalogVariantBatch1Types'
import type { CatalogProduct, CatalogProductImage } from '../../store/catalogStoreTypes'
import {
  assignCatalogImageStoragePaths,
  getCatalogProductImageAliases,
  normalizeCatalogProductImages,
  prepareCatalogImageUpload,
} from '../../domain/catalogImageDomain'
import type { SharedProductImageMetadataInput } from './contracts'
import { bootstrapSharedData } from './bootstrap'
import { browserSupabaseTokenProvider, getSupabaseAccessToken } from './supabaseSession'

type PendingCatalogImageUpload = NonNullable<ReturnType<typeof prepareCatalogImageUpload>> & {
  variantId?: string
}

export interface CatalogImageStoragePlan {
  productId: string
  /** Legacy/base product gallery. */
  images: CatalogProductImage[]
  /** Variant-owned galleries keyed by variant id. */
  variantImages: Record<string, CatalogProductImage[]>
  /** Combined metadata written atomically by replace_product_images_metadata. */
  metadata: SharedProductImageMetadataInput[]
  pendingUploads: PendingCatalogImageUpload[]
  unresolvedExternalImages: CatalogProductImage[]
}

export interface CatalogImageRemoteSyncResult {
  revision: number
  product: CatalogProduct
}

const isBundledCatalogImagePath = (path?: string): boolean => Boolean(path?.startsWith('demo/'))

const toMetadata = (
  image: CatalogProductImage,
  variantId?: string,
): SharedProductImageMetadataInput | null => {
  if (!image.storagePath) return null
  return {
    id: image.id,
    ...(variantId ? { variantId } : {}),
    storagePath: image.storagePath,
    altText: image.altText,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
    mimeType: image.mimeType ?? 'image/jpeg',
    byteSize: image.byteSize,
    width: image.width,
    height: image.height,
  }
}

const normalizeOwnerImages = (
  ownerStorageKey: string,
  productName: string,
  images: CatalogProductImage[] | undefined,
): CatalogProductImage[] => assignCatalogImageStoragePaths(
  ownerStorageKey,
  normalizeCatalogProductImages({ name: productName, images }),
).map((image, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 }))

/**
 * Builds one atomic metadata payload for the base product gallery plus every
 * variant gallery. Existing products without variant images remain fully
 * compatible because their variant image sets are simply empty.
 */
export const buildCatalogImageStoragePlan = (product: CatalogProduct): CatalogImageStoragePlan => {
  const images = assignCatalogImageStoragePaths(product.id, normalizeCatalogProductImages(product))
    .map((image, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 }))

  const variantImages = Object.fromEntries(product.variants.map((variant) => [
    variant.id,
    normalizeOwnerImages(`${product.id}-${variant.id}`, `${product.name} ${variant.size}`, variant.images),
  ]))

  const pendingUploads: PendingCatalogImageUpload[] = [
    ...images
      .map((image) => prepareCatalogImageUpload(product.id, image))
      .filter((upload): upload is NonNullable<typeof upload> => upload !== null),
    ...product.variants.flatMap((variant) => (variantImages[variant.id] ?? [])
      .map((image) => {
        const upload = prepareCatalogImageUpload(`${product.id}-${variant.id}`, image)
        return upload ? { ...upload, variantId: variant.id } : null
      })
      .filter((upload): upload is PendingCatalogImageUpload => upload !== null)),
  ]

  const metadata: SharedProductImageMetadataInput[] = [
    ...images.map((image) => toMetadata(image)).filter((image): image is SharedProductImageMetadataInput => image !== null),
    ...product.variants.flatMap((variant) => (variantImages[variant.id] ?? [])
      .map((image) => toMetadata(image, variant.id))
      .filter((image): image is SharedProductImageMetadataInput => image !== null)),
  ]

  const unresolvedExternalImages = [
    ...images,
    ...Object.values(variantImages).flat(),
  ].filter((image) => !image.storagePath && !image.url.startsWith('data:image/'))

  return { productId: product.id, images, variantImages, metadata, pendingUploads, unresolvedExternalImages }
}

export const applyCatalogImageStoragePlanLocally = (product: CatalogProduct): CatalogProduct => {
  const plan = buildCatalogImageStoragePlan(product)
  return {
    ...product,
    images: plan.images,
    variants: product.variants.map((variant) => ({
      ...variant,
      images: plan.variantImages[variant.id] ?? [],
    })),
    ...getCatalogProductImageAliases(plan.images),
  }
}

const storedUrl = (
  image: CatalogProductImage,
  publicUrl: (path: string) => string,
): CatalogProductImage => ({
  ...image,
  // demo/... assets are bundled with the application, not stored in Supabase
  // Storage. Keep their bundled URL until an admin replaces them.
  url: image.storagePath && !isBundledCatalogImagePath(image.storagePath)
    ? publicUrl(image.storagePath)
    : image.url,
})

/**
 * Live Storage adapter invoked by the authenticated Catalog bridge before
 * Catalog metadata is committed. The metadata RPC replaces every image row
 * for the product, so base and variant galleries are always saved together.
 */
export const syncCatalogProductImagesToRemote = async (
  product: CatalogProduct,
  baseRevision: number,
): Promise<CatalogImageRemoteSyncResult> => {
  const token = getSupabaseAccessToken()
  if (!token) throw new Error('Supabase staff authentication is required to sync product images.')

  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')

  const plan = buildCatalogImageStoragePlan(product)
  if (plan.unresolvedExternalImages.length > 0) {
    throw new Error('One or more product/variant images have no Storage path. Replace them in the Catalog editor before remote sync.')
  }

  const previous = await shared.repositories.catalogAdmin.getProduct(product.id)
  const previousPaths = new Set([
    ...(previous?.images.map((image) => image.storagePath) ?? []),
    ...(previous?.variants.flatMap((variant) => variant.images?.map((image) => image.storagePath) ?? []) ?? []),
  ])
  const uploadedPaths: string[] = []

  try {
    for (const upload of plan.pendingUploads) {
      if (previousPaths.has(upload.storagePath)) continue
      const metadata = plan.metadata.find((image) => image.id === upload.imageId && image.variantId === upload.variantId)
      if (!metadata) throw new Error(`Image metadata is missing for ${upload.imageId}.`)
      await shared.repositories.catalogAdmin.uploadProductImage({
        productId: product.id,
        image: metadata,
        blob: upload.blob,
      })
      uploadedPaths.push(upload.storagePath)
    }

    const result = await shared.repositories.catalogAdmin.replaceProductImagesMetadata({
      baseRevision,
      productId: product.id,
      images: plan.metadata,
    })

    const publicUrl = (path: string) => shared.repositories.client.storagePublicUrl('product-images', path)
    const storedImages = plan.images.map((image) => storedUrl(image, publicUrl))
    const storedVariantImages = Object.fromEntries(
      Object.entries(plan.variantImages).map(([variantId, ownerImages]) => [
        variantId,
        ownerImages.map((image) => storedUrl(image, publicUrl)),
      ]),
    )
    const currentPaths = new Set(plan.metadata.map((image) => image.storagePath))
    const removedPaths = [...previousPaths].filter(
      (path) => !currentPaths.has(path) && !isBundledCatalogImagePath(path),
    )
    if (removedPaths.length > 0) {
      await shared.repositories.catalogAdmin.removeProductImageObjects(removedPaths)
    }

    return {
      revision: result.revision,
      product: {
        ...product,
        images: storedImages,
        variants: product.variants.map((variant) => ({
          ...variant,
          images: storedVariantImages[variant.id] ?? [],
        })),
        ...getCatalogProductImageAliases(storedImages),
      },
    }
  } catch (error) {
    const orphaned = uploadedPaths.filter((path) => !previousPaths.has(path))
    if (orphaned.length > 0) {
      try { await shared.repositories.catalogAdmin.removeProductImageObjects(orphaned) } catch { /* best-effort cleanup */ }
    }
    throw error
  }
}