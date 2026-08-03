import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession } from './shared/supabaseSession'
import type { Json } from './shared/databaseTypes'
import { SupabaseHttpError } from './shared/supabaseHttpClient'
import { useHrStore } from '../store/hrStore'
import { usePayrollStore } from '../store/payrollStore'
import { useFinanceStore } from '../store/financeStore'
import { useStockStore } from '../store/stockStore'
import { useVoucherStore } from '../store/voucherStore'
import { useUserStore } from '../store/userStore'
import { useSettingsStore } from '../store/settingsStore'
import { canAccessSection, canEditSection } from '../config/permissions'
import { hasActionPermission } from '../config/actionPermissions'
import { usePersistenceHealthStore, type PersistenceHealthPatch } from '../store/persistenceHealthStore'
import {
  ORDER_DRAFTS_CHANGED_EVENT,
  readOrderDraftRecords,
  writeOrderDraftRecords,
} from '../store/orderDraftPersistence'
import { createHydrationCoordinator } from './hydrationCoordinator'
import { stableStringifySharedData } from './shared/sharedDataBundleDomain'

type Slice = Record<string, unknown>
type OperationalDomain = 'hr' | 'payroll' | 'finance' | 'stock' | 'vouchers' | 'order_drafts'

interface OperationalDomainResponse {
  domain: OperationalDomain
  revision: number
  snapshot: Json | null
  updatedAt: string | null
}

const dataOnly = (state: Record<string, unknown>): Slice =>
  Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function'))

const isRecord = (value: unknown): value is Slice =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const revisions = new Map<OperationalDomain, number>()
const timers = new Map<OperationalDomain, ReturnType<typeof setTimeout>>()
const saving = new Set<OperationalDomain>()
const dirty = new Set<OperationalDomain>()
const conflicted = new Set<OperationalDomain>()
const syncedSnapshots = new Map<OperationalDomain, string>()
const syncedSnapshotValues = new Map<OperationalDomain, Json>()
let hrPointMutationDepth = 0
const hrGenericSaveWaiters = new Set<() => void>()
// Circuit breaker: if a domain racks up repeated conflicts in a short
// window, something is retrying without making progress (a stale client,
// or a feedback loop between realtime hydrates and auto-save). Once open,
// only an explicit user-triggered reload (reloadConflictedDomain) can clear
// it - passive re-hydration from realtime/auth events can no longer reset
// the conflict flag and silently let the retry loop resume.
const CONFLICT_STREAK_LIMIT = 3
const CONFLICT_STREAK_WINDOW_MS = 5_000
const conflictStreaks = new Map<OperationalDomain, { count: number; windowStart: number }>()
const circuitOpen = new Set<OperationalDomain>()

const registerConflict = (domain: OperationalDomain): void => {
  const now = Date.now()
  const streak = conflictStreaks.get(domain)
  if (!streak || now - streak.windowStart > CONFLICT_STREAK_WINDOW_MS) {
    conflictStreaks.set(domain, { count: 1, windowStart: now })
    return
  }
  streak.count += 1
  if (streak.count >= CONFLICT_STREAK_LIMIT) {
    circuitOpen.add(domain)
  }
}

const clearConflictStreak = (domain: OperationalDomain): void => {
  conflictStreaks.delete(domain)
  circuitOpen.delete(domain)
}
let unsubscribers: Array<() => void> = []
let stopDraftListener: (() => void) | undefined
const hydrationCoordinator = createHydrationCoordinator()

const client = () => bootstrapSharedData(browserSupabaseTokenProvider)
const canRead = (domain: OperationalDomain): boolean => {
  const role = useUserStore.getState().role
  const settings = useSettingsStore.getState()
  switch (domain) {
    case 'hr': return canAccessSection(role, 'hr', settings.permissions)
    case 'payroll':
      return hasActionPermission(role, 'finance.view_payroll', settings.actionPermissions, settings.permissions)
        || hasActionPermission(role, 'hr.create_payroll_proposal', settings.actionPermissions, settings.permissions)
        || hasActionPermission(role, 'hr.edit_payroll_proposal', settings.actionPermissions, settings.permissions)
        || hasActionPermission(role, 'hr.resolve_rejected_employee', settings.actionPermissions, settings.permissions)
    case 'finance': return hasActionPermission(role, 'finance.view_ledger', settings.actionPermissions, settings.permissions)
    case 'stock': return settings.storeProfile.inventoryEnabled && canAccessSection(role, 'stock', settings.permissions)
    case 'vouchers': return canAccessSection(role, 'finance', settings.permissions) || canEditSection(role, 'orders', settings.permissions)
    case 'order_drafts': return !client().enabled && (
      hasActionPermission(role, 'orders.create', settings.actionPermissions, settings.permissions)
      || hasActionPermission(role, 'orders.edit', settings.actionPermissions, settings.permissions)
    )
  }
}
const canWrite = (domain: OperationalDomain): boolean => {
  const role = useUserStore.getState().role
  const settings = useSettingsStore.getState()
  switch (domain) {
    case 'hr': return canEditSection(role, 'hr', settings.permissions)
    case 'payroll': return false
    case 'finance': return canEditSection(role, 'finance', settings.permissions)
    case 'stock': return settings.storeProfile.inventoryEnabled && canEditSection(role, 'stock', settings.permissions)
    case 'vouchers': return canEditSection(role, 'finance', settings.permissions) || canEditSection(role, 'orders', settings.permissions)
    case 'order_drafts': return !client().enabled && (
      hasActionPermission(role, 'orders.create', settings.actionPermissions, settings.permissions)
      || hasActionPermission(role, 'orders.edit', settings.actionPermissions, settings.permissions)
    )
  }
}

const updateHealth = (patch: PersistenceHealthPatch): void => {
  usePersistenceHealthStore.getState().setHealth(patch)
}

const safeHrSnapshot = (): Slice => {
  const hr = dataOnly(useHrStore.getState() as unknown as Record<string, unknown>)
  // PINs are local authentication secrets and must never be copied to JSONB.
  if (Array.isArray(hr.employees)) {
    hr.employees = hr.employees.map((employee) => {
      if (!isRecord(employee)) return employee
      const { pin: _pin, ...safeEmployee } = employee
      return safeEmployee
    })
  }
  return hr
}

const FINANCE_SERVER_OWNED_SOURCES = new Set(['order_payment', 'order_refund', 'payroll'])

const isServerOwnedFinanceTransaction = (value: unknown): value is Slice =>
  isRecord(value) && (
    value.isSystemGenerated === true ||
    (typeof value.source === 'string' && FINANCE_SERVER_OWNED_SOURCES.has(value.source))
  )

const safeFinanceSnapshot = (): Json => {
  const finance = dataOnly(useFinanceStore.getState() as unknown as Record<string, unknown>)
  const localTransactions = Array.isArray(finance.transactions) ? finance.transactions : []
  const baseline = syncedSnapshotValues.get('finance')
  const baselineTransactions = isRecord(baseline) && Array.isArray(baseline.transactions)
    ? baseline.transactions
    : []
  const authoritativeById = new Map<string, unknown>()

  for (const transaction of baselineTransactions) {
    if (!isServerOwnedFinanceTransaction(transaction) || typeof transaction.id !== 'string') continue
    authoritativeById.set(transaction.id, transaction)
  }

  const seen = new Set<string>()
  const transactions = localTransactions.flatMap((transaction) => {
    if (!isServerOwnedFinanceTransaction(transaction)) return [transaction]
    if (typeof transaction.id !== 'string') return []
    const authoritative = authoritativeById.get(transaction.id)
    if (!authoritative) return []
    seen.add(transaction.id)
    return [authoritative]
  })

  for (const transaction of baselineTransactions) {
    if (!isServerOwnedFinanceTransaction(transaction) || typeof transaction.id !== 'string') continue
    if (seen.has(transaction.id)) continue
    transactions.push(transaction)
  }

  finance.transactions = transactions
  return finance as Json
}

const snapshotForDomain = (domain: OperationalDomain): Json => {
  switch (domain) {
    case 'hr': return safeHrSnapshot() as Json
    case 'payroll': return dataOnly(usePayrollStore.getState() as unknown as Record<string, unknown>) as Json
    case 'finance': return safeFinanceSnapshot()
    case 'stock': return dataOnly(useStockStore.getState() as unknown as Record<string, unknown>) as Json
    case 'vouchers': return dataOnly(useVoucherStore.getState() as unknown as Record<string, unknown>) as Json
    case 'order_drafts': return readOrderDraftRecords<unknown>() as Json
  }
}

const snapshotFingerprint = (snapshot: Json): string =>
  stableStringifySharedData(snapshot)

// Returns the shape that was actually written into the store, so callers can
// fingerprint what will be read back later instead of the raw server payload.
// For domains where the applied state is identical to the input snapshot,
// returning null tells the caller to fall back to fingerprinting the input.
const applyDomainSnapshot = (domain: OperationalDomain, snapshot: Json): Json | null => {
  switch (domain) {
    case 'hr': {
      if (!isRecord(snapshot)) return null
      const localEmployees = useHrStore.getState().employees
      const remoteHr = { ...snapshot }
      if (Array.isArray(remoteHr.employees)) {
        remoteHr.employees = remoteHr.employees.map((employee) => {
          if (!isRecord(employee)) return employee
          const local = localEmployees.find((candidate) => candidate.id === employee.id)
          return local ? { ...employee, pin: local.pin } : employee
        })
      }
      useHrStore.setState(remoteHr as never, false)
      // safeHrSnapshot() strips pin before every save, so the fingerprint
      // baseline must also be taken post-strip - otherwise the very first
      // debounced save after this hydrate will "detect" a change (the
      // reintroduced pins disappearing) that was never a real edit.
      return safeHrSnapshot() as Json
    }
    case 'payroll':
      if (isRecord(snapshot)) usePayrollStore.setState(snapshot as never, false)
      return null
    case 'finance':
      if (isRecord(snapshot)) useFinanceStore.setState(snapshot as never, false)
      return null
    case 'stock':
      if (isRecord(snapshot)) useStockStore.setState(snapshot as never, false)
      return null
    case 'vouchers':
      if (isRecord(snapshot)) useVoucherStore.setState(snapshot as never, false)
      return null
    case 'order_drafts':
      if (Array.isArray(snapshot)) writeOrderDraftRecords(snapshot)
      return null
  }
}

const isRevisionConflict = (error: unknown): boolean =>
  error instanceof SupabaseHttpError &&
  (error.message.includes('REVISION_CONFLICT') ||
    (typeof error.payload === 'object' && error.payload !== null &&
      'code' in error.payload && error.payload.code === '40001'))

const operationalSaveErrorMessage = (domain: OperationalDomain, error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : ''
  if (domain === 'finance' && rawMessage.includes('SERVER_OWNED_FINANCE_ENTRY')) {
    return 'Automatic finance entries are managed from their source workflow. Reload Finance and update the related order, refund, or payroll record instead.'
  }
  if (domain === 'finance' && rawMessage.includes('FINANCE_ENTRY_DELETE_NOT_ALLOWED')) {
    return 'Finance history cannot be deleted. Edit a manual transaction or correct the original workflow instead.'
  }
  return rawMessage || `Unable to save ${domain}.`
}

const loadDomain = async (
  domain: OperationalDomain,
  apply = true,
  force = false,
): Promise<OperationalDomainResponse | null> => {
  const boot = client()
  if (!boot.enabled || !canRead(domain)) return null
  const response = await boot.repositories.client.rpc<OperationalDomainResponse>(
    'get_operational_domain_state',
    { p_domain: domain },
  )
  revisions.set(domain, response.revision)
  // Once the circuit is open, only an explicit manual reload (apply=true is
  // also used for that) may pass through - but a manual reload is expected
  // to reset the streak. Passive callers (realtime/auth-refresh hydrates)
  // pass apply=true too today, so gate specifically on the breaker instead
  // of trusting the caller's intent.
  if (apply && circuitOpen.has(domain) && !force) {
    return response
  }
  if (apply) {
    if (response.snapshot !== null) {
      // Record the server value before updating Zustand. Store subscriptions
      // fire for remote hydration too; without this baseline every Realtime
      // refresh is mistaken for a local edit and written back to Supabase.
      //
      // IMPORTANT: applyDomainSnapshot can rewrite the snapshot before it
      // reaches the store (e.g. the 'hr' case re-merges local-only PIN
      // fields that are intentionally stripped from the server copy). The
      // fingerprint recorded here must reflect what actually lands in the
      // store, not the raw server payload, or persistDomain will see a
      // perpetual "local edit" that doesn't exist and re-save on every
      // hydrate - which is exactly what was hammering Supabase.
      const appliedSnapshot = applyDomainSnapshot(domain, response.snapshot)
      const canonicalSnapshot = appliedSnapshot ?? response.snapshot
      syncedSnapshotValues.set(domain, canonicalSnapshot)
      syncedSnapshots.set(domain, snapshotFingerprint(canonicalSnapshot))
    }
    conflicted.delete(domain)
  }
  return response
}

const persistDomain = async (domain: OperationalDomain): Promise<void> => {
  if (hydrationCoordinator.isHydrating || !getSupabaseBrowserSession() || !canWrite(domain) || conflicted.has(domain)) return
  if (domain === 'hr' && hrPointMutationDepth > 0) {
    dirty.add(domain)
    return
  }
  if (saving.has(domain)) {
    dirty.add(domain)
    return
  }

  const boot = client()
  if (!boot.enabled) return

  saving.add(domain)
  try {
    do {
      // A point command owns the HR revision while it is in flight. Preserve
      // any pending generic HR edit and let it resume after the point command
      // acknowledges the authoritative revision.
      if (domain === 'hr' && hrPointMutationDepth > 0) return
      dirty.delete(domain)
      const expectedRevision = revisions.get(domain) ?? 0
      const snapshot = snapshotForDomain(domain)
      const fingerprint = snapshotFingerprint(snapshot)
      if (syncedSnapshots.get(domain) === fingerprint) continue
      updateHealth({ status: 'saving', message: undefined })

      try {
        const response = domain === 'hr'
          ? await boot.repositories.client.rpc<OperationalDomainResponse>('save_hr_operational_state', {
              p_expected_revision: expectedRevision,
              p_snapshot: snapshot,
            })
          : domain === 'finance'
            ? await boot.repositories.client.rpc<OperationalDomainResponse>('save_finance_operational_state', {
                p_expected_revision: expectedRevision,
                p_snapshot: snapshot,
              })
            : await boot.repositories.client.rpc<OperationalDomainResponse>('save_operational_domain_state', {
                p_domain: domain,
                p_expected_revision: expectedRevision,
                p_snapshot: snapshot,
              })
        revisions.set(domain, response.revision)
        syncedSnapshotValues.set(domain, snapshot)
        syncedSnapshots.set(domain, fingerprint)
        updateHealth({
          status: 'saved',
          lastSavedAt: response.updatedAt ?? new Date().toISOString(),
          revision: response.revision,
          message: undefined,
        })
      } catch (error) {
        if (isRevisionConflict(error)) {
          registerConflict(domain)
          const remote = await loadDomain(domain, false).catch(() => null)
          void boot.repositories.client.rpc('record_mutation_conflict', {
            p_action: 'operational.save',
            p_entity_type: 'operational_domain',
            p_entity_id: domain,
            p_expected_revision: expectedRevision,
            p_observed_revision: remote?.revision,
          }).catch(() => undefined)
          conflicted.add(domain)
          dirty.delete(domain)
          const locked = circuitOpen.has(domain)
          updateHealth({
            status: 'conflict',
            revision: remote?.revision ?? expectedRevision,
            message: locked
              ? `${domain} kept conflicting and auto-recovery has been paused to protect the database. Use "Reload ${domain}" to fetch the latest version before editing again.`
              : `${domain} changed in another session. Your local changes were not overwritten; reload before saving this section again.`,
          })
          return
        }
        updateHealth({
          status: 'error',
          message: operationalSaveErrorMessage(domain, error),
        })
        return
      }
    } while (dirty.has(domain))
  } finally {
    saving.delete(domain)
    if (domain === 'hr' && hrGenericSaveWaiters.size > 0) {
      const waiters = [...hrGenericSaveWaiters]
      hrGenericSaveWaiters.clear()
      for (const resolve of waiters) resolve()
    }
  }
}

const schedule = (domain: OperationalDomain): void => {
  if (hydrationCoordinator.isHydrating || !getSupabaseBrowserSession() || !canWrite(domain) || conflicted.has(domain)) return
  dirty.add(domain)
  if (domain === 'hr' && hrPointMutationDepth > 0) return
  const existing = timers.get(domain)
  if (existing) clearTimeout(existing)
  timers.set(domain, setTimeout(() => {
    timers.delete(domain)
    void persistDomain(domain)
  }, 350))
}

/**
 * Dedicated point RPCs and the generic HR snapshot share one revision counter.
 * These helpers serialize the two writers without allowing either one to mark
 * unrelated local HR edits as saved.
 */
export const beginHrPointMutation = async (): Promise<void> => {
  hrPointMutationDepth += 1
  const pendingTimer = timers.get('hr')
  if (pendingTimer) {
    clearTimeout(pendingTimer)
    timers.delete('hr')
  }
  if (saving.has('hr')) {
    await new Promise<void>((resolve) => hrGenericSaveWaiters.add(resolve))
  }
}

export const acknowledgeHrPointProjection = (nextRevision: number, pointEntries: Json): void => {
  if (!Number.isFinite(nextRevision) || !Array.isArray(pointEntries)) return
  revisions.set('hr', nextRevision)

  const baseline = syncedSnapshotValues.get('hr')
  if (!isRecord(baseline)) return

  const nextBaseline = {
    ...baseline,
    employeePointEntries: pointEntries,
  } as Json
  syncedSnapshotValues.set('hr', nextBaseline)
  syncedSnapshots.set('hr', snapshotFingerprint(nextBaseline))
}

export const endHrPointMutation = (): void => {
  hrPointMutationDepth = Math.max(0, hrPointMutationDepth - 1)
  if (hrPointMutationDepth === 0 && dirty.has('hr')) schedule('hr')
}

const hydrateOperationalState = async (): Promise<boolean> => {
  if (!getSupabaseBrowserSession()) return false
  const boot = client()
  if (!boot.enabled) return false

  const domains: OperationalDomain[] = ['hr','payroll','finance','stock','vouchers','order_drafts']
  const readableDomains = domains.filter(canRead)
  let allSucceeded = true
  for (const domain of readableDomains) {
    try {
      await loadDomain(domain, true)
    } catch (error) {
      allSucceeded = false
      updateHealth({
        status: 'error',
        message: error instanceof Error ? error.message : `Unable to load ${domain}.`,
      })
    }
  }
  return allSucceeded
}

export const hydrateOperationalStateFromSupabase = (): Promise<boolean> =>
  hydrationCoordinator.run(hydrateOperationalState)

// Explicit, user-initiated recovery for a domain whose circuit breaker has
// opened after repeated conflicts. Unlike the passive hydrate path, this
// always fetches the latest snapshot, applies it, and resets both the
// conflict flag and the streak - re-enabling auto-save for the domain.
export const reloadConflictedDomain = async (domain: OperationalDomain): Promise<boolean> => {
  const response = await loadDomain(domain, true, true).catch(() => null)
  if (!response) return false
  clearConflictStreak(domain)
  conflicted.delete(domain)
  updateHealth({ status: 'saved', revision: response.revision, lastSavedAt: response.updatedAt ?? new Date().toISOString(), message: undefined })
  return true
}

export const startOperationalSupabaseSync = (): void => {
  if (unsubscribers.length || stopDraftListener) return

  const subscriptions: Array<[OperationalDomain, { subscribe: (listener: () => void) => () => void }]> = [
    ['hr', useHrStore],
    ['finance', useFinanceStore],
    ['stock', useStockStore],
    ['vouchers', useVoucherStore],
  ]

  unsubscribers = subscriptions
    .filter(([domain]) => canWrite(domain))
    .map(([domain, store]) => store.subscribe(() => schedule(domain)))

  if (typeof window !== 'undefined' && canWrite('order_drafts')) {
    const onDraftsChanged = () => schedule('order_drafts')
    window.addEventListener(ORDER_DRAFTS_CHANGED_EVENT, onDraftsChanged)
    stopDraftListener = () => window.removeEventListener(ORDER_DRAFTS_CHANGED_EVENT, onDraftsChanged)
  }
}

export const stopOperationalSupabaseSync = (): void => {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  dirty.clear()
  conflicted.clear()
  conflictStreaks.clear()
  circuitOpen.clear()
  syncedSnapshots.clear()
  syncedSnapshotValues.clear()
  hrPointMutationDepth = 0
  for (const resolve of hrGenericSaveWaiters) resolve()
  hrGenericSaveWaiters.clear()
  saving.clear()
  unsubscribers.forEach((unsubscribe) => unsubscribe())
  unsubscribers = []
  stopDraftListener?.()
  stopDraftListener = undefined
}

export const connectOperationalSupabase = async (): Promise<boolean> => {
  const hydrated = await hydrateOperationalStateFromSupabase()
  if (!hydrated) return false
  startOperationalSupabaseSync()
  return true
}
