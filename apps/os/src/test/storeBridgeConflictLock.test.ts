import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseHttpError } from '../data/shared/supabaseHttpClient'
import { getLocalSharedStoreSnapshot } from '../data/shared/storeLocalAdapter'
import { useSettingsStore } from '../store/settingsStore'
import { useUserStore } from '../store/userStore'

const mocks = vi.hoisted(() => ({
  replaceSnapshot: vi.fn(),
  getAdminState: vi.fn(),
  getStoreProfile: vi.fn(),
  listBranches: vi.fn(),
  listPublicPaymentAccounts: vi.fn(),
  getPaymentInstructions: vi.fn(),
}))

vi.mock('../data/shared/bootstrap', () => ({
  bootstrapSharedData: () => ({
    enabled: true as const,
    repositories: {
      storeAdmin: {
        replaceSnapshot: mocks.replaceSnapshot,
        getAdminState: mocks.getAdminState,
        getStoreProfile: mocks.getStoreProfile,
        listBranches: mocks.listBranches,
        listPublicPaymentAccounts: mocks.listPublicPaymentAccounts,
        getPaymentInstructions: mocks.getPaymentInstructions,
      },
    },
  }),
}))

vi.mock('../data/shared/supabaseSession', () => ({
  browserSupabaseTokenProvider: { getAccessToken: () => 'jwt' },
  getSupabaseAccessToken: () => 'jwt',
}))

import {
  flushBusinessOsStoreSync,
  getStoreBridgeStatus,
  initializeBusinessOsStoreBridge,
  refreshBusinessOsStoreFromRemote,
  stopBusinessOsStoreBridge,
} from '../data/shared/storeBridge'

const remote = getLocalSharedStoreSnapshot()
const conflict = () =>
  new SupabaseHttpError('STORE_CONFLICT: expected revision 7, current revision 9.', 409, { code: 'PT409' })

const editStoreName = (name: string) =>
  useSettingsStore.setState((state) => ({ storeProfile: { ...state.storeProfile, storeName: name } }))

const settle = async () => {
  await vi.advanceTimersByTimeAsync(1_000)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useUserStore.setState({ role: 'owner' } as never)
  mocks.getAdminState.mockResolvedValue({ revision: 7 })
  mocks.getStoreProfile.mockResolvedValue(remote.profile)
  mocks.listBranches.mockResolvedValue(remote.branches)
  mocks.listPublicPaymentAccounts.mockResolvedValue(remote.paymentAccounts)
  mocks.getPaymentInstructions.mockResolvedValue(remote.paymentInstructions)
  mocks.replaceSnapshot.mockRejectedValue(conflict())
})

afterEach(() => {
  stopBusinessOsStoreBridge()
  vi.useRealTimers()
})

describe('Store bridge conflict lock', () => {
  it('stops every save path after a stale-revision conflict until the latest Store is loaded', async () => {
    await initializeBusinessOsStoreBridge()
    expect(getStoreBridgeStatus().phase).toBe('remote')

    editStoreName('Edited once')
    await settle()
    expect(mocks.replaceSnapshot).toHaveBeenCalledTimes(1)
    expect(getStoreBridgeStatus().phase).toBe('conflict')

    // Autosave, focus retry and manual flush must all stay local while locked.
    editStoreName('Edited twice')
    await settle()
    window.dispatchEvent(new Event('focus'))
    await settle()
    await expect(flushBusinessOsStoreSync()).resolves.toBe(false)
    expect(mocks.replaceSnapshot).toHaveBeenCalledTimes(1)

    // A passive refresh with pending edits must not clear the conflict state.
    await expect(refreshBusinessOsStoreFromRemote()).resolves.toBe(false)
    expect(getStoreBridgeStatus().phase).toBe('conflict')
    window.dispatchEvent(new Event('focus'))
    await settle()
    expect(mocks.replaceSnapshot).toHaveBeenCalledTimes(1)

    // Loading the latest Store releases the lock; the next edit saves again.
    mocks.getAdminState.mockResolvedValue({ revision: 9 })
    mocks.replaceSnapshot.mockResolvedValue({ revision: 10 })
    await expect(refreshBusinessOsStoreFromRemote({ discardLocalChanges: true })).resolves.toBe(true)
    editStoreName('Edited after reload')
    await settle()
    expect(mocks.replaceSnapshot).toHaveBeenCalledTimes(2)
    expect(mocks.replaceSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({ baseRevision: 9 }))
    expect(getStoreBridgeStatus().phase).toBe('remote')
  })
})
