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

export interface CatalogImageStoragePlan {
  productId: string
  images: CatalogProductImage[]
  metadata: SharedProductImageMetadataInput[]
  pendingUploads: Array<NonNullable<ReturnType<typeof prepareCatalogImageUpload>>>
  unresolvedExternalImages: CatalogProductImage[]
}

export interface CatalogImageRemoteSyncResult {
  revision: number
  product: CatalogProduct
}

const isBundledCatalogImagePath = (path?: string): boolean => Boolean(path?.startsWith('demo/'))

const toMetadata = (image: CatalogProductImage): SharedProductImageMetadataInput | null => {
  if (!image.storagePath) return null
  return {
    id: image.id,
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

/**
 * Local Phase-5 adapter. It gives each freshly edited data URL the exact
 * future Storage object key and creates the metadata payload without needing
 * a live Supabase project.
 */
export const buildCatalogImageStoragePlan = (product: CatalogProduct): CatalogImageStoragePlan => {
  const images = assignCatalogImageStoragePaths(product.id, normalizeCatalogProductImages(product))
    .map((image, index) => ({ ...image, sortOrder: index, isPrimary: index === 0 }))

  const pendingUploads = images
    .map((image) => prepareCatalogImageUpload(product.id, image))
    .filter((upload): upload is NonNullable<typeof upload> => upload !== null)

  const metadata = images
    .map(toMetadata)
    .filter((image): image is SharedProductImageMetadataInput => image !== null)

  const unresolvedExternalImages = images.filter((image) => !image.storagePath && !image.url.startsWith('data:image/'))

  return { productId: product.id, images, metadata, pendingUploads, unresolvedExternalImages }
}

export const applyCatalogImageStoragePlanLocally = (product: CatalogProduct): CatalogProduct => {
  const plan = buildCatalogImageStoragePlan(product)
  return { ...product, images: plan.images, ...getCatalogProductImageAliases(plan.images) }
}

/**
 * Live Storage adapter invoked by the authenticated Catalog bridge before
 * Catalog metadata is committed. Offline/demo mode continues to use the
 * local storage plan without contacting Supabase.
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
    throw new Error('One or more product images have no Storage path. Replace them in the Catalog editor before remote sync.')
  }

  const previous = await shared.repositories.catalogAdmin.getProduct(product.id)
  const previousPaths = new Set(previous?.images.map((image) => image.storagePath) ?? [])
  const uploadedPaths: string[] = []

  try {
    for (const upload of plan.pendingUploads) {
      if (previousPaths.has(upload.storagePath)) continue
      const metadata = plan.metadata.find((image) => image.id === upload.imageId)
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

    const storedImages: CatalogProductImage[] = plan.images.map((image) => ({
      ...image,
      // demo/... assets are bundled with the application, not stored in
      // Supabase Storage. Keep their existing /catalog-demo/... URL until
      // the user explicitly replaces them with a newly uploaded image.
      url: image.storagePath && !isBundledCatalogImagePath(image.storagePath)
        ? shared.repositories.client.storagePublicUrl('product-images', image.storagePath)
        : image.url,
    }))
    const currentPaths = new Set(plan.metadata.map((image) => image.storagePath))
    const removedPaths = [...previousPaths].filter(
      (path) => !currentPaths.has(path) && !isBundledCatalogImagePath(path),
    )
    if (removedPaths.length > 0) {
      await shared.repositories.catalogAdmin.removeProductImageObjects(removedPaths)
    }

    return {
      revision: result.revision,
      product: { ...product, images: storedImages, ...getCatalogProductImageAliases(storedImages) },
    }
  } catch (error) {
    // If metadata replacement failed, clean up only objects newly uploaded to
    // paths that were not already part of the remote product.
    const orphaned = uploadedPaths.filter((path) => !previousPaths.has(path))
    if (orphaned.length > 0) {
      try { await shared.repositories.catalogAdmin.removeProductImageObjects(orphaned) } catch { /* best-effort cleanup */ }
    }
    throw error
  }
}
