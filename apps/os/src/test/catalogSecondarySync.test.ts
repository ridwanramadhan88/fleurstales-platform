import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseHttpError } from '../data/shared/supabaseHttpClient'
import { getLocalSharedCatalogSnapshot } from '../data/shared/catalogLocalAdapter'
import { useCatalogStore } from '../store/catalogStore'
import { useUserStore } from '../store/userStore'

const mocks = vi.hoisted(() => ({
  replaceSnapshot: vi.fn(),
  replaceArrangementTypes: vi.fn(),
  replaceSizeGuideLibrary: vi.fn(),
  listSizeGuideTemplates: vi.fn(),
  listSizeGuideTargets: vi.fn(),
  listArrangementTypes: vi.fn(),
  listOccasions: vi.fn(),
  listProducts: vi.fn(),
  getAdminState: vi.fn(),
}))

vi.mock('../data/shared/bootstrap', () => ({
  bootstrapSharedData: () => ({
    enabled: true as const,
    repositories: {
      client: { storagePublicUrl: (_bucket: string, path: string) => `https://cdn.test/${path}` },
      catalogAdmin: {
        replaceSnapshot: mocks.replaceSnapshot,
        replaceArrangementTypes: mocks.replaceArrangementTypes,
        replaceSizeGuideLibrary: mocks.replaceSizeGuideLibrary,
        listSizeGuideTemplates: mocks.listSizeGuideTemplates,
        listSizeGuideTargets: mocks.listSizeGuideTargets,
        listArrangementTypes: mocks.listArrangementTypes,
        listOccasions: mocks.listOccasions,
        listProducts: mocks.listProducts,
        getAdminState: mocks.getAdminState,
        uploadProductImage: vi.fn(),
        removeProductImageObjects: vi.fn(),
        removeSizeGuideObjects: vi.fn(),
      },
    },
  }),
}))

vi.mock('../data/shared/supabaseSession', () => ({
  browserSupabaseTokenProvider: { getAccessToken: () => 'jwt' },
  getSupabaseAccessToken: () => 'jwt',
}))

import {
  flushBusinessOsCatalogSync,
  flushBusinessOsSizeGuideSync,
  refreshBusinessOsCatalogFromRemote,
  stopBusinessOsCatalogBridge,
} from '../data/shared/catalogBridge'

const remote = getLocalSharedCatalogSnapshot(7)

const renameFirstProduct = (name: string) =>
  useCatalogStore.setState((state) => ({
    products: state.products.map((product, index) => (index === 0 ? { ...product, name } : product)),
  }))

beforeEach(async () => {
  vi.clearAllMocks()
  useUserStore.setState({ role: 'owner' } as never)
  mocks.listOccasions.mockResolvedValue(remote.occasions)
  mocks.listProducts.mockResolvedValue(remote.products)
  mocks.getAdminState.mockResolvedValue({ revision: 7, deletedProductCodes: [] })
  mocks.listSizeGuideTemplates.mockResolvedValue([])
  mocks.listSizeGuideTargets.mockResolvedValue([])
  mocks.listArrangementTypes.mockResolvedValue([])
  mocks.replaceSnapshot.mockResolvedValue({ revision: 8 })
  mocks.replaceArrangementTypes.mockResolvedValue({ count: 0 })
  mocks.replaceSizeGuideLibrary.mockResolvedValue(undefined)
  // Model a server whose arrangement-type table already matches the products: load once to
  // learn the merged list, then serve exactly that list.
  await expect(refreshBusinessOsCatalogFromRemote({ discardLocalChanges: true })).resolves.toBe(true)
  mocks.listArrangementTypes.mockResolvedValue(useCatalogStore.getState().arrangementTypes.map((name) => ({ name })))
  await expect(refreshBusinessOsCatalogFromRemote({ discardLocalChanges: true })).resolves.toBe(true)
  vi.clearAllMocks()
})

afterEach(() => {
  stopBusinessOsCatalogBridge()
})

describe('Catalog secondary writes', () => {
  it('does not rewrite arrangement types or the size-guide library when only products changed', async () => {
    renameFirstProduct('Renamed bouquet')
    await expect(flushBusinessOsCatalogSync()).resolves.toBe(true)

    expect(mocks.replaceSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.replaceArrangementTypes).not.toHaveBeenCalled()
    expect(mocks.replaceSizeGuideLibrary).not.toHaveBeenCalled()
  })

  it('still sends arrangement types when they changed', async () => {
    useCatalogStore.setState((state) => ({ arrangementTypes: [...state.arrangementTypes, 'Hand-tied test'] }))
    await expect(flushBusinessOsCatalogSync()).resolves.toBe(true)

    expect(mocks.replaceArrangementTypes).toHaveBeenCalledTimes(1)
    expect(mocks.replaceArrangementTypes).toHaveBeenCalledWith(expect.arrayContaining(['Hand-tied test']))
    expect(mocks.replaceSizeGuideLibrary).not.toHaveBeenCalled()

    // A later product-only save must not resend the now-synced arrangement types.
    renameFirstProduct('Renamed again')
    await expect(flushBusinessOsCatalogSync()).resolves.toBe(true)
    expect(mocks.replaceArrangementTypes).toHaveBeenCalledTimes(1)
  })

  it('refuses the direct size-guide save while the Catalog revision is stale', async () => {
    mocks.replaceSnapshot.mockRejectedValue(
      new SupabaseHttpError('CATALOG_CONFLICT: expected revision 7, current revision 9.', 409, { code: 'PT409' }),
    )
    renameFirstProduct('Stale edit')
    await expect(flushBusinessOsCatalogSync()).resolves.toBe(false)

    await expect(flushBusinessOsSizeGuideSync()).resolves.toBe(false)
    expect(mocks.replaceSizeGuideLibrary).not.toHaveBeenCalled()
    expect(mocks.listSizeGuideTemplates).not.toHaveBeenCalled()
  })
})
