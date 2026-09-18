import './catalogVariantBatch1Types'
import { useCatalogStore } from '../../store/catalogStore'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { canEditSection } from '../../config/permissions'
import type {
  CatalogCategoryConfig,
  CatalogProduct,
  CatalogProductImage,
  CatalogStoreState,
} from '../../store/catalogStoreTypes'
import type { SharedOccasion, SharedProduct, SharedProductImage, SharedProductImageMetadataInput } from './contracts'
import { bootstrapSharedData } from './bootstrap'
import { browserSupabaseTokenProvider, getSupabaseAccessToken } from './supabaseSession'
import { buildCatalogImageStoragePlan, materializeCatalogImagesAfterCommit } from './catalogImageBridge'
import { applyRemoteSizeGuideLibrary, syncLocalSizeGuideLibrary } from './sizeGuideBridge'

export type CatalogBridgeMode = 'business_os' | 'storefront'
export type CatalogBridgePhase =
  | 'local_fallback'
  | 'loading'
  | 'remote'
  | 'saving'
  | 'auth_required'
  | 'conflict'
  | 'error'

export interface CatalogBridgeStatus {
  mode?: CatalogBridgeMode
  phase: CatalogBridgePhase
  remoteConfigured: boolean
  writable: boolean
  lastLoadedAt?: string
  lastSavedAt?: string
  remoteRevision?: number
  message?: string
}

let bridgeStatus: CatalogBridgeStatus = {
  phase: 'local_fallback',
  remoteConfigured: false,
  writable: false,
}
const statusListeners = new Set<(status: CatalogBridgeStatus) => void>()

const setBridgeStatus = (patch: Partial<CatalogBridgeStatus>): void => {
  bridgeStatus = { ...bridgeStatus, ...patch }
  statusListeners.forEach((listener) => listener(bridgeStatus))
}

export const getCatalogBridgeStatus = (): CatalogBridgeStatus => bridgeStatus
export const subscribeCatalogBridgeStatus = (listener: (status: CatalogBridgeStatus) => void): (() => void) => {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

const normalizeTags = (category: string, occasionTags?: string[]): string[] =>
  [...new Set([category, ...(occasionTags ?? [])].filter(Boolean))]

const mapRemoteImage = (image: SharedProductImage, index: number): CatalogProductImage => ({
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
})

const mapRemoteCatalog = (
  occasions: SharedOccasion[],
  products: SharedProduct[],
  arrangementTypes?: string[],
): Pick<CatalogStoreState, 'categories' | 'products' | 'arrangementTypes'> => {
  const occasionById = new Map(occasions.map((occasion) => [occasion.id, occasion]))
  const categories: CatalogCategoryConfig[] = occasions
    .filter((occasion) => occasion.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((occasion) => ({ id: occasion.id, name: occasion.name, prefix: occasion.prefix }))

  const mappedProducts = [...products]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((product): CatalogProduct => {
      const primaryOccasion = product.primaryOccasionId ? occasionById.get(product.primaryOccasionId) : undefined
      const linkedOccasions = product.occasionIds
        .map((id) => occasionById.get(id)?.name)
        .filter((name): name is string => Boolean(name))
      const category = primaryOccasion?.name ?? linkedOccasions[0] ?? 'Uncategorized'
      const images: CatalogProductImage[] = [...product.images]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(mapRemoteImage)
      const imageUrls = images.map((image) => image.url)
      const primaryImage = images[0]?.url

      return {
        id: product.id,
        productId: product.productCode,
        category,
        occasionTags: normalizeTags(category, linkedOccasions),
        productType: product.productType,
        collectionSeries: product.collectionSeries,
        pricingType: product.pricingType,
        orderType: product.orderType,
        material: product.material,
        name: product.name,
        description: product.description,
        images,
        ...(primaryImage ? { thumbnail: primaryImage } : {}),
        ...(imageUrls.length ? { gallery: imageUrls } : {}),
        variants: product.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          ...(variant.sizeOptionId ? { sizeOptionId: variant.sizeOptionId } : {}),
          size: variant.size,
          price: variant.priceIdr,
          ...(variant.costIdr !== undefined ? { cost: variant.costIdr ?? undefined } : {}),
          status: variant.status,
          ...(variant.images?.length ? {
            images: [...variant.images]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map(mapRemoteImage),
          } : {}),
          ...(variant.flowerRecipe?.length ? {
            flowerRecipe: variant.flowerRecipe.map((item) => ({
              id: item.id,
              flowerName: item.flowerName,
              quantity: item.quantity,
              unit: item.unit,
            })),
          } : {}),
        })),
        isFeatured: product.isFeatured,
        isActive: product.isActive,
        promoLabel: product.promoLabel,
        originalPriceIdr: product.originalPriceIdr,
        isCustomizable: product.isCustomizable,
      }
    })

  const productArrangementTypes = mappedProducts
    .map((product) => product.productType?.trim())
    .filter((value): value is string => Boolean(value))
  return {
    categories,
    products: mappedProducts,
    arrangementTypes: [...new Set([...(arrangementTypes ?? []), ...productArrangementTypes])],
  }
}

const snapshotImage = (
  productId: string,
  image: SharedProductImageMetadataInput,
): SharedProductImage => ({
  id: image.id,
  productId,
  ...(image.variantId ? { variantId: image.variantId } : {}),
  storagePath: image.storagePath,
  publicUrl: image.storagePath,
  altText: image.altText,
  sortOrder: image.sortOrder,
  isPrimary: image.isPrimary,
  mimeType: image.mimeType,
  byteSize: image.byteSize,
  width: image.width,
  height: image.height,
})

const buildRemoteSnapshot = (state: CatalogStoreState): { occasions: SharedOccasion[]; products: SharedProduct[] } => {
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
    const occasionIds = normalizeTags(product.category, product.occasionTags)
      .map((name) => occasionByName.get(name)?.id)
      .filter((id): id is string => Boolean(id))
    if (primary && !occasionIds.includes(primary.id)) occasionIds.unshift(primary.id)

    const imagePlan = buildCatalogImageStoragePlan(product)
    const sharedImages = imagePlan.metadata.map((image) => snapshotImage(product.id, image))

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
        ...(variant.sizeOptionId ? { sizeOptionId: variant.sizeOptionId } : {}),
        size: variant.size,
        priceIdr: variant.price,
        status: variant.status,
        sortOrder: variantIndex,
        ...(variant.cost !== undefined ? { costIdr: variant.cost } : {}),
        images: sharedImages.filter((image) => image.variantId === variant.id),
        ...(variant.flowerRecipe?.length ? {
          flowerRecipe: variant.flowerRecipe.map((item, recipeIndex) => ({
            id: item.id,
            flowerName: item.flowerName,
            quantity: item.quantity,
            unit: item.unit,
            sortOrder: recipeIndex,
          })),
        } : { flowerRecipe: [] }),
      })),
      images: sharedImages.filter((image) => !image.variantId),
    }
  })

  return { occasions, products }
}

const productImageHash = (product: CatalogProduct): string => JSON.stringify(
  buildCatalogImageStoragePlan(product).metadata.map((image) => ({
    id: image.id,
    variantId: image.variantId,
    storagePath: image.storagePath,
    altText: image.altText,
    sortOrder: image.sortOrder,
    isPrimary: image.isPrimary,
    mimeType: image.mimeType,
    byteSize: image.byteSize,
    width: image.width,
    height: image.height,
  })),
)

const snapshotHash = (state: CatalogStoreState): string => JSON.stringify({
  ...buildRemoteSnapshot(state),
  productImages: state.products.map((product) => ({ id: product.id, hash: productImageHash(product) })),
  sizeGuideTemplates: state.sizeGuideTemplates,
  sizeGuideTargets: state.sizeGuideTargets,
  arrangementTypes: state.arrangementTypes,
})

let suppressLocalSync = false
let catalogUnsubscribe: (() => void) | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let remoteRevision: number | undefined
let lastSyncedHash: string | undefined
let businessFocusAttached = false
let storefrontFocusAttached = false
let saveInFlight = false
let saveRequestedWhileSaving = false
const remoteImagePaths = new Set<string>()

const collectRemoteImagePaths = (products: CatalogProduct[]): Set<string> => new Set(
  products.flatMap((product) => [
    ...(product.images ?? []),
    ...product.variants.flatMap((variant) => variant.images ?? []),
  ])
    .map((image) => image.storagePath)
    .filter((path): path is string => Boolean(path) && !path.startsWith('demo/')),
)

const applyRemoteCatalog = (
  occasions: SharedOccasion[],
  products: SharedProduct[],
  deletedProductCodes?: string[],
  arrangementTypes?: string[],
): void => {
  const mapped = mapRemoteCatalog(occasions, products, arrangementTypes)
  suppressLocalSync = true
  try {
    useCatalogStore.setState((state: CatalogStoreState) => ({
      ...mapped,
      deletedProductIds: deletedProductCodes ?? state.deletedProductIds,
    }))
  } finally {
    suppressLocalSync = false
  }
}

const explainError = (error: unknown): string => error instanceof Error ? error.message : 'Catalog synchronization failed.'

export const refreshStorefrontCatalogFromRemote = async (): Promise<boolean> => {
  const shared = bootstrapSharedData()
  if (!shared.enabled) {
    setBridgeStatus({
      mode: 'storefront',
      phase: 'local_fallback',
      remoteConfigured: false,
      writable: false,
      message: 'Supabase is not configured; using the bundled catalog fallback.',
    })
    return false
  }

  setBridgeStatus({ mode: 'storefront', phase: 'loading', remoteConfigured: true, writable: false, message: undefined })
  try {
    const [occasions, products, sizeGuideTemplates, sizeGuideTargets] = await Promise.all([
      shared.repositories.catalog.listOccasions(),
      shared.repositories.catalog.listProducts(),
      shared.repositories.catalog.listSizeGuideTemplates(),
      shared.repositories.catalog.listSizeGuideTargets(),
    ])
    const sellableProducts = products.filter((product) => product.variants.length > 0)
    if (occasions.length === 0 || sellableProducts.length === 0) {
      setBridgeStatus({
        phase: 'error',
        remoteConfigured: true,
        writable: false,
        message: 'Supabase catalog is empty. Production Storefront cannot use the bundled prototype catalog.',
      })
      return false
    }
    applyRemoteCatalog(occasions, sellableProducts)
    suppressLocalSync = true
    try { applyRemoteSizeGuideLibrary(sizeGuideTemplates, sizeGuideTargets) } finally { suppressLocalSync = false }
    setBridgeStatus({
      phase: 'remote',
      remoteConfigured: true,
      writable: false,
      lastLoadedAt: new Date().toISOString(),
      message: undefined,
    })
    return true
  } catch (error) {
    setBridgeStatus({
      phase: 'error',
      remoteConfigured: true,
      writable: false,
      message: explainError(error),
    })
    return false
  }
}

const ensureBusinessSubscription = (): void => {
  if (catalogUnsubscribe) return
  catalogUnsubscribe = useCatalogStore.subscribe((state: CatalogStoreState) => {
    if (suppressLocalSync || remoteRevision === undefined) return
    const currentHash = snapshotHash(state)
    if (currentHash === lastSyncedHash) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      void flushBusinessOsCatalogSync()
    }, 700)
  })
}

export const refreshBusinessOsCatalogFromRemote = async (options?: { discardLocalChanges?: boolean }): Promise<boolean> => {
  const accessToken = getSupabaseAccessToken()
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) {
    setBridgeStatus({
      mode: 'business_os',
      phase: 'local_fallback',
      remoteConfigured: false,
      writable: false,
      message: 'Supabase is not configured; using the local catalog.',
    })
    return false
  }
  if (!accessToken) {
    setBridgeStatus({
      mode: 'business_os',
      phase: 'auth_required',
      remoteConfigured: true,
      writable: false,
      message: 'A Supabase staff session is required before OS catalog data can replace the local fallback.',
    })
    return false
  }

  const hasPendingLocalChanges = remoteRevision !== undefined
    && lastSyncedHash !== undefined
    && snapshotHash(useCatalogStore.getState()) !== lastSyncedHash
  if (hasPendingLocalChanges && !options?.discardLocalChanges) {
    setBridgeStatus({
      phase: 'remote',
      remoteConfigured: true,
      writable: true,
      message: 'Remote refresh skipped because local Catalog changes are waiting to be saved.',
    })
    return false
  }

  setBridgeStatus({ mode: 'business_os', phase: 'loading', remoteConfigured: true, writable: false, message: undefined })
  try {
    const role = useUserStore.getState().role
    const canManageCatalog = canEditSection(role, 'catalog', useSettingsStore.getState().permissions)
    const [occasions, products, adminState, sizeGuideTemplates, sizeGuideTargets, arrangementTypes] = canManageCatalog
      ? await Promise.all([
          shared.repositories.catalogAdmin.listOccasions({ includeInactive: true }),
          shared.repositories.catalogAdmin.listProducts({ includeInactive: true, includeCosts: true }),
          shared.repositories.catalogAdmin.getAdminState(),
          shared.repositories.catalogAdmin.listSizeGuideTemplates(),
          shared.repositories.catalogAdmin.listSizeGuideTargets(),
          shared.repositories.catalogAdmin.listArrangementTypes(),
        ])
      : await Promise.all([
          shared.repositories.catalog.listOccasions(),
          shared.repositories.catalog.listProducts({ includeCosts: role === 'finance' }),
          Promise.resolve({ revision: 0, deletedProductCodes: [] }),
          shared.repositories.catalog.listSizeGuideTemplates(),
          shared.repositories.catalog.listSizeGuideTargets(),
          Promise.resolve([]),
        ])
    if (occasions.length === 0 || products.length === 0) {
      setBridgeStatus({
        phase: 'error',
        remoteConfigured: true,
        writable: false,
        message: 'The Supabase catalog is empty. Add a product or restore the catalog before making catalog changes.',
      })
      return false
    }

    applyRemoteCatalog(
      occasions,
      products,
      adminState.deletedProductCodes,
      arrangementTypes.map((item) => item.name),
    )
    suppressLocalSync = true
    try { applyRemoteSizeGuideLibrary(sizeGuideTemplates, sizeGuideTargets) } finally { suppressLocalSync = false }
    remoteRevision = canManageCatalog ? adminState.revision : undefined
    lastSyncedHash = snapshotHash(useCatalogStore.getState())
    remoteImagePaths.clear()
    for (const path of collectRemoteImagePaths(useCatalogStore.getState().products)) remoteImagePaths.add(path)
    if (canManageCatalog) ensureBusinessSubscription()
    setBridgeStatus({
      phase: 'remote',
      remoteConfigured: true,
      writable: canManageCatalog,
      remoteRevision,
      lastLoadedAt: new Date().toISOString(),
      message: undefined,
    })
    return true
  } catch (error) {
    setBridgeStatus({
      phase: 'error',
      remoteConfigured: true,
      writable: false,
      message: explainError(error),
    })
    return false
  }
}

export const flushBusinessOsCatalogSync = async (): Promise<boolean> => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  if (remoteRevision === undefined) return false
  if (saveInFlight) {
    saveRequestedWhileSaving = true
    return true
  }

  const accessToken = getSupabaseAccessToken()
  if (!accessToken) {
    setBridgeStatus({ phase: 'auth_required', writable: false, message: 'Sesi Supabase staf sudah tidak tersedia.' })
    return false
  }

  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return false

  const currentState = useCatalogStore.getState()
  const currentHash = snapshotHash(currentState)
  if (currentHash === lastSyncedHash) return true

  saveInFlight = true
  let succeeded = false
  let catalogCommitted = false
  const uploadedPaths: string[] = []
  setBridgeStatus({ phase: 'saving', writable: true, message: undefined })

  try {
    const plans = currentState.products.map((product) => ({
      product,
      plan: buildCatalogImageStoragePlan(product),
    }))

    for (const { plan } of plans) {
      if (plan.unresolvedExternalImages.length > 0) {
        throw new Error('Satu atau lebih foto produk belum memiliki path Storage. Ganti foto tersebut sebelum menyimpan.')
      }
      for (const upload of plan.pendingUploads) {
        if (remoteImagePaths.has(upload.storagePath)) continue
        const metadata = plan.metadata.find(
          (image) => image.id === upload.imageId && image.variantId === upload.variantId,
        )
        if (!metadata) throw new Error('Metadata foto tidak lengkap untuk ' + upload.imageId + '.')
        await shared.repositories.catalogAdmin.uploadProductImage({
          productId: plan.productId,
          image: metadata,
          blob: upload.blob,
        })
        uploadedPaths.push(upload.storagePath)
      }
    }

    const snapshot = buildRemoteSnapshot(currentState)
    const result = await shared.repositories.catalogAdmin.replaceSnapshot({
      baseRevision: remoteRevision,
      occasions: snapshot.occasions,
      products: snapshot.products,
    })
    remoteRevision = result.revision
    catalogCommitted = true

    const currentPaths = new Set(
      plans.flatMap(({ plan }) => plan.metadata.map((image) => image.storagePath))
        .filter((path) => !path.startsWith('demo/')),
    )
    const removedPaths = [...remoteImagePaths].filter((path) => !currentPaths.has(path))

    const publicUrl = (path: string) => shared.repositories.client.storagePublicUrl('product-images', path)
    suppressLocalSync = true
    try {
      useCatalogStore.setState((state) => ({
        products: state.products.map((product) => materializeCatalogImagesAfterCommit(product, publicUrl)),
      }))
    } finally {
      suppressLocalSync = false
    }

    remoteImagePaths.clear()
    currentPaths.forEach((path) => remoteImagePaths.add(path))
    if (removedPaths.length > 0) {
      try { await shared.repositories.catalogAdmin.removeProductImageObjects(removedPaths) } catch { /* best-effort object cleanup */ }
    }

    let secondaryMessage: string | undefined
    try {
      await shared.repositories.catalogAdmin.replaceArrangementTypes(
        useCatalogStore.getState().arrangementTypes,
      )
      await syncLocalSizeGuideLibrary(shared.repositories.catalogAdmin)
      lastSyncedHash = snapshotHash(useCatalogStore.getState())
    } catch (secondaryError) {
      secondaryMessage = 'Produk tersimpan, tetapi pengaturan Catalog lain masih perlu disinkronkan: ' + explainError(secondaryError)
    }

    succeeded = true
    setBridgeStatus({
      phase: 'remote',
      writable: true,
      remoteRevision,
      lastSavedAt: new Date().toISOString(),
      message: secondaryMessage,
    })
    return true
  } catch (error) {
    if (!catalogCommitted && uploadedPaths.length > 0) {
      try { await shared.repositories.catalogAdmin.removeProductImageObjects(uploadedPaths) } catch { /* best-effort orphan cleanup */ }
    }

    const message = explainError(error)
    const conflict = /CATALOG_CONFLICT|revision/i.test(message)
    setBridgeStatus({
      phase: conflict ? 'conflict' : 'error',
      writable: true,
      message: conflict
        ? 'Catalog berubah di sesi lain. Draft lokal tidak ditimpa; muat ulang data terbaru sebelum mencoba menyimpan lagi.'
        : message,
    })
    return false
  } finally {
    saveInFlight = false
    const runAgain = succeeded && saveRequestedWhileSaving
    saveRequestedWhileSaving = false
    if (runAgain) queueMicrotask(() => { void flushBusinessOsCatalogSync() })
  }
}

export const initializeStorefrontCatalogBridge = async (): Promise<void> => {
  const loaded = await refreshStorefrontCatalogFromRemote()
  if (bootstrapSharedData().enabled && !loaded) {
    throw new Error(getCatalogBridgeStatus().message ?? 'Remote Catalog is unavailable.')
  }
  if (!storefrontFocusAttached && typeof window !== 'undefined') {
    storefrontFocusAttached = true
    window.addEventListener('focus', () => { void refreshStorefrontCatalogFromRemote() })
  }
}

export const initializeBusinessOsCatalogBridge = async (): Promise<void> => {
  await refreshBusinessOsCatalogFromRemote()
  if (!businessFocusAttached && typeof window !== 'undefined') {
    businessFocusAttached = true
    window.addEventListener('focus', () => {
      if (getCatalogBridgeStatus().phase === 'conflict') return
      const hasPendingLocalChanges = remoteRevision !== undefined
        && lastSyncedHash !== undefined
        && snapshotHash(useCatalogStore.getState()) !== lastSyncedHash
      if (hasPendingLocalChanges) void flushBusinessOsCatalogSync()
      else void refreshBusinessOsCatalogFromRemote()
    })
  }
}

export const stopBusinessOsCatalogBridge = (): void => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  catalogUnsubscribe?.()
  catalogUnsubscribe = undefined
  remoteRevision = undefined
  lastSyncedHash = undefined
  saveInFlight = false
  saveRequestedWhileSaving = false
  remoteImagePaths.clear()
}