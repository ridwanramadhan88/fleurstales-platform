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

const snapshotForDomain = (domain: OperationalDomain): Json => {
  switch (domain) {
    case 'hr': return safeHrSnapshot() as Json
    case 'payroll': return dataOnly(usePayrollStore.getState() as unknown as Record<string, unknown>) as Json
    case 'finance': return dataOnly(useFinanceStore.getState() as unknown as Record<string, unknown>) as Json
    case 'stock': return dataOnly(useStockStore.getState() as unknown as Record<string, unknown>) as Json
    case 'vouchers': return dataOnly(useVoucherStore.getState() as unknown as Record<string, unknown>) as Json
    case 'order_drafts': return readOrderDraftRecords<unknown>() as Json
  }
}

const applyDomainSnapshot = (domain: OperationalDomain, snapshot: Json): void => {
  switch (domain) {
    case 'hr': {
      if (!isRecord(snapshot)) return
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
      return
    }
    case 'payroll':
      if (isRecord(snapshot)) usePayrollStore.setState(snapshot as never, false)
      return
    case 'finance':
      if (isRecord(snapshot)) useFinanceStore.setState(snapshot as never, false)
      return
    case 'stock':
      if (isRecord(snapshot)) useStockStore.setState(snapshot as never, false)
      return
    case 'vouchers':
      if (isRecord(snapshot)) useVoucherStore.setState(snapshot as never, false)
      return
    case 'order_drafts':
      if (Array.isArray(snapshot)) writeOrderDraftRecords(snapshot)
      return
  }
}

const isRevisionConflict = (error: unknown): boolean =>
  error instanceof SupabaseHttpError &&
  (error.message.includes('REVISION_CONFLICT') ||
    (typeof error.payload === 'object' && error.payload !== null &&
      'code' in error.payload && error.payload.code === '40001'))

const loadDomain = async (domain: OperationalDomain, apply = true): Promise<OperationalDomainResponse | null> => {
  const boot = client()
  if (!boot.enabled || !canRead(domain)) return null
  const response = await boot.repositories.client.rpc<OperationalDomainResponse>(
    'get_operational_domain_state',
    { p_domain: domain },
  )
  revisions.set(domain, response.revision)
  if (apply) {
    if (response.snapshot !== null) applyDomainSnapshot(domain, response.snapshot)
    conflicted.delete(domain)
  }
  return response
}

const persistDomain = async (domain: OperationalDomain): Promise<void> => {
  if (hydrationCoordinator.isHydrating || !getSupabaseBrowserSession() || !canWrite(domain) || conflicted.has(domain)) return
  if (saving.has(domain)) {
    dirty.add(domain)
    return
  }

  const boot = client()
  if (!boot.enabled) return

  saving.add(domain)
  try {
    do {
      dirty.delete(domain)
      const expectedRevision = revisions.get(domain) ?? 0
      const snapshot = snapshotForDomain(domain)
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
        updateHealth({
          status: 'saved',
          lastSavedAt: response.updatedAt ?? new Date().toISOString(),
          revision: response.revision,
          message: undefined,
        })
      } catch (error) {
        if (isRevisionConflict(error)) {
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
          updateHealth({
            status: 'conflict',
            revision: remote?.revision ?? expectedRevision,
            message: `${domain} changed in another session. Your local changes were not overwritten; reload before saving this section again.`,
          })
          return
        }
        updateHealth({
          status: 'error',
          message: error instanceof Error ? error.message : `Unable to save ${domain}.`,
        })
        return
      }
    } while (dirty.has(domain))
  } finally {
    saving.delete(domain)
  }
}

const schedule = (domain: OperationalDomain): void => {
  if (hydrationCoordinator.isHydrating || !getSupabaseBrowserSession() || !canWrite(domain) || conflicted.has(domain)) return
  dirty.add(domain)
  const existing = timers.get(domain)
  if (existing) clearTimeout(existing)
  timers.set(domain, setTimeout(() => {
    timers.delete(domain)
    void persistDomain(domain)
  }, 350))
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
