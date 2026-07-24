import { useSettingsStore } from '../../store/settingsStore'
import type { SharedStoreSnapshot } from './contracts'
import { bootstrapSharedData } from './bootstrap'
import { browserSupabaseTokenProvider, getSupabaseAccessToken } from './supabaseSession'
import { applySharedStoreSnapshotToLocalState, getLocalSharedStoreSnapshot } from './storeLocalAdapter'
import { buildSharedStoreSnapshot } from './storeSettingsDomain'

export type StoreBridgeMode = 'business_os' | 'storefront'
export type StoreBridgePhase =
  | 'local_fallback'
  | 'loading'
  | 'remote'
  | 'saving'
  | 'auth_required'
  | 'conflict'
  | 'error'

export interface StoreBridgeStatus {
  mode?: StoreBridgeMode
  phase: StoreBridgePhase
  remoteConfigured: boolean
  writable: boolean
  lastLoadedAt?: string
  lastSavedAt?: string
  remoteRevision?: number
  message?: string
}

let bridgeStatus: StoreBridgeStatus = {
  phase: 'local_fallback',
  remoteConfigured: false,
  writable: false,
}
const statusListeners = new Set<(status: StoreBridgeStatus) => void>()

const setBridgeStatus = (patch: Partial<StoreBridgeStatus>): void => {
  bridgeStatus = { ...bridgeStatus, ...patch }
  statusListeners.forEach((listener) => listener(bridgeStatus))
}

export const getStoreBridgeStatus = (): StoreBridgeStatus => bridgeStatus
export const subscribeStoreBridgeStatus = (listener: (status: StoreBridgeStatus) => void): (() => void) => {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

const explainError = (error: unknown): string =>
  error instanceof Error ? error.message : 'Store settings synchronization failed.'

const snapshotHash = (): string => JSON.stringify(buildSharedStoreSnapshot(useSettingsStore.getState()))

let suppressLocalSync = false
let settingsUnsubscribe: (() => void) | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let remoteRevision: number | undefined
let lastSyncedHash: string | undefined
let businessFocusAttached = false
let storefrontFocusAttached = false
let saveInFlight = false
let saveRequestedWhileSaving = false

const applySnapshot = (snapshot: SharedStoreSnapshot): void => {
  suppressLocalSync = true
  try {
    applySharedStoreSnapshotToLocalState(snapshot)
  } finally {
    suppressLocalSync = false
  }
}

const normalizeLocalFallback = (): void => {
  const snapshot = getLocalSharedStoreSnapshot()
  applySnapshot(snapshot)
}

const readStorefrontSnapshot = async (): Promise<SharedStoreSnapshot | null> => {
  const shared = bootstrapSharedData()
  if (!shared.enabled) return null
  const [profile, branches, paymentAccounts, paymentInstructions] = await Promise.all([
    shared.repositories.store.getStoreProfile(),
    shared.repositories.store.listBranches(),
    shared.repositories.store.listPublicPaymentAccounts(),
    shared.repositories.store.getPaymentInstructions(),
  ])
  if (!profile || branches.length === 0) return null
  return { profile, branches, paymentAccounts, paymentInstructions }
}

const readBusinessSnapshot = async (): Promise<{ snapshot: SharedStoreSnapshot; revision: number }> => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  const [profile, branches, paymentAccounts, paymentInstructions, adminState] = await Promise.all([
    shared.repositories.storeAdmin.getStoreProfile(),
    shared.repositories.storeAdmin.listBranches({ includeInactive: true }),
    shared.repositories.storeAdmin.listPublicPaymentAccounts({ includeInactive: true, includeHidden: true }),
    shared.repositories.storeAdmin.getPaymentInstructions(),
    shared.repositories.storeAdmin.getAdminState(),
  ])
  if (!profile || branches.length === 0) {
    throw new Error('Authenticated shared Store data is empty. Seed Store details before enabling OS writes.')
  }
  return {
    snapshot: { profile, branches, paymentAccounts, paymentInstructions },
    revision: adminState.revision,
  }
}

export const refreshStorefrontStoreFromRemote = async (): Promise<boolean> => {
  const shared = bootstrapSharedData()
  if (!shared.enabled) {
    normalizeLocalFallback()
    setBridgeStatus({
      mode: 'storefront',
      phase: 'local_fallback',
      remoteConfigured: false,
      writable: false,
      message: 'Supabase is not configured; using normalized local Store details.',
    })
    return false
  }

  setBridgeStatus({ mode: 'storefront', phase: 'loading', remoteConfigured: true, writable: false, message: undefined })
  try {
    const snapshot = await readStorefrontSnapshot()
    if (!snapshot) {
      normalizeLocalFallback()
      setBridgeStatus({
        phase: 'local_fallback',
        remoteConfigured: true,
        writable: false,
        message: 'Remote Store details are empty; keeping the normalized local fallback.',
      })
      return false
    }
    applySnapshot(snapshot)
    setBridgeStatus({
      phase: 'remote',
      remoteConfigured: true,
      writable: false,
      lastLoadedAt: new Date().toISOString(),
      message: undefined,
    })
    return true
  } catch (error) {
    normalizeLocalFallback()
    setBridgeStatus({
      phase: 'local_fallback',
      remoteConfigured: true,
      writable: false,
      message: `${explainError(error)} Using normalized local Store details.`,
    })
    return false
  }
}

const ensureBusinessSubscription = (): void => {
  if (settingsUnsubscribe) return
  settingsUnsubscribe = useSettingsStore.subscribe(() => {
    if (suppressLocalSync || remoteRevision === undefined) return
    const currentHash = snapshotHash()
    if (currentHash === lastSyncedHash) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      void flushBusinessOsStoreSync()
    }, 700)
  })
}

export const refreshBusinessOsStoreFromRemote = async (options?: { discardLocalChanges?: boolean }): Promise<boolean> => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) {
    normalizeLocalFallback()
    setBridgeStatus({
      mode: 'business_os',
      phase: 'local_fallback',
      remoteConfigured: false,
      writable: false,
      message: 'Supabase is not configured; using normalized local Store details.',
    })
    return false
  }
  if (!getSupabaseAccessToken()) {
    normalizeLocalFallback()
    setBridgeStatus({
      mode: 'business_os',
      phase: 'auth_required',
      remoteConfigured: true,
      writable: false,
      message: 'A Supabase Owner session is required before remote Store details can replace the local fallback.',
    })
    return false
  }

  const hasPendingLocalChanges = remoteRevision !== undefined
    && lastSyncedHash !== undefined
    && snapshotHash() !== lastSyncedHash
  if (hasPendingLocalChanges && !options?.discardLocalChanges) {
    setBridgeStatus({
      phase: 'remote',
      remoteConfigured: true,
      writable: true,
      message: 'Remote Store refresh skipped because local Store changes are waiting to be saved.',
    })
    return false
  }

  setBridgeStatus({ mode: 'business_os', phase: 'loading', remoteConfigured: true, writable: false, message: undefined })
  try {
    const remote = await readBusinessSnapshot()
    applySnapshot(remote.snapshot)
    remoteRevision = remote.revision
    lastSyncedHash = snapshotHash()
    ensureBusinessSubscription()
    setBridgeStatus({
      phase: 'remote',
      remoteConfigured: true,
      writable: true,
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

export const flushBusinessOsStoreSync = async (): Promise<boolean> => {
  if (remoteRevision === undefined) return false
  if (saveInFlight) {
    saveRequestedWhileSaving = true
    return true
  }
  if (!getSupabaseAccessToken()) {
    setBridgeStatus({ phase: 'auth_required', writable: false, message: 'Supabase Owner session is missing or expired.' })
    return false
  }

  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return false
  const currentHash = snapshotHash()
  if (currentHash === lastSyncedHash) return true

  saveInFlight = true
  let succeeded = false
  setBridgeStatus({ phase: 'saving', writable: true, message: undefined })
  try {
    const snapshot = buildSharedStoreSnapshot(useSettingsStore.getState())
    const result = await shared.repositories.storeAdmin.replaceSnapshot({
      baseRevision: remoteRevision,
      snapshot,
    })
    remoteRevision = result.revision
    lastSyncedHash = currentHash
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
    const conflict = /STORE_CONFLICT|revision/i.test(message)
    setBridgeStatus({
      phase: conflict ? 'conflict' : 'error',
      writable: true,
      message: conflict
        ? 'Store details changed in another OS session. Local edits were kept and were not overwritten; reload the remote Store data before saving again.'
        : message,
    })
    return false
  } finally {
    saveInFlight = false
    const runAgain = succeeded && saveRequestedWhileSaving
    saveRequestedWhileSaving = false
    if (runAgain) queueMicrotask(() => { void flushBusinessOsStoreSync() })
  }
}

export const initializeStorefrontStoreBridge = async (): Promise<void> => {
  await refreshStorefrontStoreFromRemote()
  if (!storefrontFocusAttached && typeof window !== 'undefined') {
    storefrontFocusAttached = true
    window.addEventListener('focus', () => { void refreshStorefrontStoreFromRemote() })
  }
}

export const initializeBusinessOsStoreBridge = async (): Promise<void> => {
  await refreshBusinessOsStoreFromRemote()
  if (!businessFocusAttached && typeof window !== 'undefined') {
    businessFocusAttached = true
    window.addEventListener('focus', () => {
      if (getStoreBridgeStatus().phase === 'conflict') return
      const hasPendingLocalChanges = remoteRevision !== undefined
        && lastSyncedHash !== undefined
        && snapshotHash() !== lastSyncedHash
      if (hasPendingLocalChanges) void flushBusinessOsStoreSync()
      else void refreshBusinessOsStoreFromRemote()
    })
  }
}

export const stopBusinessOsStoreBridge = (): void => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  settingsUnsubscribe?.()
  settingsUnsubscribe = undefined
  remoteRevision = undefined
  lastSyncedHash = undefined
  saveInFlight = false
  saveRequestedWhileSaving = false
}
