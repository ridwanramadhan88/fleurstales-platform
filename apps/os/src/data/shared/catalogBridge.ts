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
import type { SharedOccasion, SharedProduct } from './contracts'
import { bootstrapSharedData } from './bootstrap'
import { browserSupabaseTokenProvider, getSupabaseAccessToken } from './supabaseSession'
import { buildCatalogImageStoragePlan, syncCatalogProductImagesToRemote } from './catalogImageBridge'
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
          size: variant.size,
          price: variant.priceIdr,
          ...(variant.costIdr !== undefined ? { cost: variant.costIdr ?? undefined } : {}),
          status: variant.status,
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
      // Phase 5 owns Storage/image writes. The Phase 4 RPC intentionally
      // ignores this field, so existing remote image rows are preserved.
      images: [],
    }
  })

  return { occasions, products }
}

const snapshotHash = (state: CatalogStoreState): string => JSON.stringify({
  ...buildRemoteSnapshot(state),
  sizeGuideTemplates: state.sizeGuideTemplates,
  sizeGuideTargets: state.sizeGuideTargets,
  arrangementTypes: state.arrangementTypes,
})

const productImageHash = (product: CatalogProduct): string => JSON.stringify(
  buildCatalogImageStoragePlan(product).images.map((image) => ({
    id: image.id,
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

let suppressLocalSync = false
let catalogUnsubscribe: (() => void) | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let remoteRevision: number | undefined
let lastSyncedHash: string | undefined
let businessFocusAttached = false
let storefrontFocusAttached = false
let saveInFlight = false
let saveRequestedWhileSaving = false
const remoteImageHashes = new Map<string, string>()

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
          shared.repositories.catalog.listProducts(),
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
    remoteImageHashes.clear()
    for (const product of useCatalogStore.getState().products) remoteImageHashes.set(product.id, productImageHash(product))
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
  if (remoteRevision === undefined) return false
  if (saveInFlight) {
    saveRequestedWhileSaving = true
    return true
  }

  const accessToken = getSupabaseAccessToken()
  if (!accessToken) {
    setBridgeStatus({ phase: 'auth_required', writable: false, message: 'Supabase staff session is missing or expired.' })
    return false
  }

  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return false
  const currentState = useCatalogStore.getState()
  const currentHash = snapshotHash(currentState)
  if (currentHash === lastSyncedHash) return true

  saveInFlight = true
  let succeeded = false
  setBridgeStatus({ phase: 'saving', writable: true, message: undefined })
  try {
    let workingRevision = remoteRevision
    for (const product of currentState.products) {
      const imageHash = productImageHash(product)
      if (remoteImageHashes.get(product.id) === imageHash) continue
      const synced = await syncCatalogProductImagesToRemote(product, workingRevision)
      workingRevision = synced.revision
      // Image metadata replacement advances the shared Catalog revision. Keep
      // the browser's authoritative revision current even if a later stage
      // (arrangement types / size guides) fails.
      remoteRevision = workingRevision
      suppressLocalSync = true
      try {
        useCatalogStore.setState((state) => ({
          products: state.products.map((item) => item.id === synced.product.id ? synced.product : item),
        }))
      } finally {
        suppressLocalSync = false
      }
      remoteImageHashes.set(synced.product.id, productImageHash(synced.product))
    }
    const snapshot = buildRemoteSnapshot(useCatalogStore.getState())
    const result = await shared.repositories.catalogAdmin.replaceSnapshot({
      baseRevision: workingRevision,
      occasions: snapshot.occasions,
      products: snapshot.products,
    })
    // Commit the revision immediately after this revision-advancing stage.
    // lastSyncedHash remains unchanged until the complete pipeline succeeds,
    // so a later failure stays visibly dirty and can be retried safely.
    remoteRevision = result.revision
    await shared.repositories.catalogAdmin.replaceArrangementTypes(
      useCatalogStore.getState().arrangementTypes,
    )
    await syncLocalSizeGuideLibrary(shared.repositories.catalogAdmin)
    lastSyncedHash = snapshotHash(useCatalogStore.getState())
    succeeded = true
    setBridgeStatus({
      phase: 'remote',
      writable: true,
      remoteRevision,
      lastSavedAt: new Date().toISOString(),
      message: undefined,
    })
    return true
  } catch (error) {
    const message = explainError(error)
    const conflict = /CATALOG_CONFLICT|revision/i.test(message)
    setBridgeStatus({
      phase: conflict ? 'conflict' : 'error',
      writable: true,
      message: conflict
        ? 'Catalog changed in another OS session. Local edits were kept and were not overwritten; reload the remote catalog before saving again.'
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
  remoteImageHashes.clear()
}
