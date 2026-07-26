import { useCustomerStore } from '../../store/customerStore'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import type { CustomerBusinessMetric, SharedCustomer } from './contracts'
import { bootstrapSharedData } from './bootstrap'
import { browserSupabaseTokenProvider } from './supabaseSession'
import { toast } from '../../hooks/use-toast'

let stopCustomerSync: (() => void) | undefined
let generation = 0
let applyingRemote = false
let confirmed = new Map<string, number>()
let confirmedSnapshots = new Map<string, CustomerProfile>()
let inFlight = new Set<string>()
let dirty = new Set<string>()
let pendingDeletes = new Set<string>()
let conflicted = new Set<string>()
let conflictLocalRevisions = new Map<string, number>()
let retryAttempts = new Map<string, number>()
let retryTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const stopBusinessOsCustomerBridge = (): void => {
  generation += 1
  stopCustomerSync?.()
  stopCustomerSync = undefined
  confirmed = new Map()
  confirmedSnapshots = new Map()
  inFlight = new Set()
  dirty = new Set()
  pendingDeletes = new Set()
  conflicted = new Set()
  conflictLocalRevisions = new Map()
  retryAttempts = new Map()
  for (const timer of retryTimers.values()) clearTimeout(timer)
  retryTimers = new Map()
}

const toSharedCustomer = (customer: CustomerProfile): SharedCustomer => ({
  id: customer.id, revision: customer.revision ?? 1, name: customer.name,
  whatsappNumber: customer.whatsappNumber, normalizedWhatsappNumber: customer.normalizedWhatsappNumber,
  email: customer.email, birthday: customer.birthday, preferredBranchId: customer.preferredBranch,
  tags: customer.tags ?? [], notes: customer.notes, promoCode: customer.promoCode,
  createdSource: customer.createdSource ?? 'admin', createdAt: customer.createdAt ?? new Date().toISOString(),
  updatedAt: customer.updatedAt ?? new Date().toISOString(),
})

const fromShared = (customer: SharedCustomer, metric?: CustomerBusinessMetric): CustomerProfile => ({
  id: customer.id, revision: customer.revision, createdAt: customer.createdAt, updatedAt: customer.updatedAt,
  name: customer.name, whatsappNumber: customer.whatsappNumber, normalizedWhatsappNumber: customer.normalizedWhatsappNumber,
  email: customer.email, birthday: customer.birthday, preferredBranch: customer.preferredBranchId,
  tags: customer.tags, notes: customer.notes, promoCode: customer.promoCode, createdSource: customer.createdSource,
  authoritativeLifetimeSpendIdr: metric?.lifetimeSpendIdr,
  authoritativeOrderCount: metric?.orderCount,
  authoritativeSegment: metric?.segment,
})

const editableFields: Array<keyof CustomerProfile> = [
  'name', 'whatsappNumber', 'normalizedWhatsappNumber', 'email', 'birthday',
  'preferredBranch', 'tags', 'notes', 'promoCode', 'createdSource',
]
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

const mergeCustomer = (base: CustomerProfile, local: CustomerProfile, remote: CustomerProfile) => {
  const merged: CustomerProfile = { ...remote }
  const conflicts: string[] = []
  for (const field of editableFields) {
    const baseValue = base[field]
    const localValue = local[field]
    const remoteValue = remote[field]
    const localChanged = !same(localValue, baseValue)
    const remoteChanged = !same(remoteValue, baseValue)
    if (localChanged && remoteChanged && !same(localValue, remoteValue)) {
      conflicts.push(String(field))
      Object.assign(merged, { [field]: localValue })
      continue
    }
    if (localChanged) Object.assign(merged, { [field]: localValue })
  }
  return {
    merged: { ...merged, revision: (remote.revision ?? 1) + 1, updatedAt: new Date().toISOString() },
    conflicts,
  }
}

const clearRetry = (customerId: string): void => {
  const timer = retryTimers.get(customerId)
  if (timer) clearTimeout(timer)
  retryTimers.delete(customerId)
  retryAttempts.delete(customerId)
}

const scheduleRetry = (customerId: string, currentGeneration = generation): void => {
  if (currentGeneration !== generation || conflicted.has(customerId) || retryTimers.has(customerId)) return
  const attempt = (retryAttempts.get(customerId) ?? 0) + 1
  retryAttempts.set(customerId, attempt)
  const delay = Math.min(30_000, 750 * (2 ** Math.min(attempt - 1, 5)))
  const timer = setTimeout(() => {
    retryTimers.delete(customerId)
    void flushCustomer(customerId, currentGeneration)
  }, delay)
  retryTimers.set(customerId, timer)
}

const emitConflict = (customerId: string, fields: string[], localRevision: number): void => {
  conflicted.add(customerId)
  conflictLocalRevisions.set(customerId, localRevision)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fleurstales:customer-sync-conflict', {
      detail: { customerId, fields },
    }))
  }
  toast({
    title: 'Customer update conflict',
    description: `Your local changes were preserved. Review ${fields.join(', ')} and save the profile again to overwrite the remote version.`,
  })
  console.error(`Customer ${customerId} has conflicting remote edits in: ${fields.join(', ')}`)
}

const applyRemote = (saved: SharedCustomer, currentGeneration = generation, metric?: CustomerBusinessMetric): void => {
  if (currentGeneration !== generation) return
  const mapped = fromShared(saved, metric)
  applyingRemote = true
  try {
    useCustomerStore.setState((state) => ({
      customers: state.customers.some((item) => item.id === saved.id)
        ? state.customers.map((item) => item.id === saved.id ? mapped : item)
        : [mapped, ...state.customers],
    }))
    confirmed.set(saved.id, saved.revision)
    confirmedSnapshots.set(saved.id, mapped)
    conflicted.delete(saved.id)
    conflictLocalRevisions.delete(saved.id)
    clearRetry(saved.id)
  } finally { applyingRemote = false }
}

const flushCustomer = async (id: string, currentGeneration = generation): Promise<void> => {
  if (inFlight.has(id) || currentGeneration !== generation || conflicted.has(id)) { dirty.add(id); return }
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return
  inFlight.add(id)
  try {
    do {
      dirty.delete(id)
      const customer = useCustomerStore.getState().customers.find((item) => item.id === id)
      const expected = confirmed.get(id)
      if (!customer || expected === undefined || (customer.revision ?? 1) <= expected) break
      try {
        const saved = await shared.repositories.customersAdmin.saveCustomer(toSharedCustomer(customer), expected)
        applyRemote(saved, currentGeneration)
      } catch {
        const remoteShared = await shared.repositories.customersAdmin.getCustomer(id).catch(() => null)
        if (!remoteShared) { dirty.add(id); scheduleRetry(id, currentGeneration); break }
        const remote = fromShared(remoteShared)
        const base = confirmedSnapshots.get(id) ?? remote
        const latestLocal = useCustomerStore.getState().customers.find((item) => item.id === id) ?? customer
        const { merged, conflicts } = mergeCustomer(base, latestLocal, remote)
        confirmed.set(id, remote.revision)
        confirmedSnapshots.set(id, remote)
        applyingRemote = true
        try {
          useCustomerStore.setState((state) => ({ customers: state.customers.map((item) => item.id === id ? merged : item) }))
        } finally { applyingRemote = false }
        if (conflicts.length) { emitConflict(id, conflicts, merged.revision ?? 1); break }
        dirty.add(id)
      }
    } while (dirty.has(id) && !conflicted.has(id))
  } finally {
    inFlight.delete(id)
    if (dirty.has(id) && !conflicted.has(id)) scheduleRetry(id, currentGeneration)
  }
}

const flushDelete = async (id: string, expected: number): Promise<void> => {
  if (pendingDeletes.has(id)) return
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return
  pendingDeletes.add(id)
  try {
    await shared.repositories.customersAdmin.deleteCustomer(id, expected)
    confirmed.delete(id)
    confirmedSnapshots.delete(id)
  } catch {
    const remote = await shared.repositories.customersAdmin.getCustomer(id).catch(() => null)
    const nextExpected = remote?.revision ?? expected
    if (!retryTimers.has(`delete:${id}`)) {
      const timer = setTimeout(() => {
        retryTimers.delete(`delete:${id}`)
        void flushDelete(id, nextExpected)
      }, 2_000)
      retryTimers.set(`delete:${id}`, timer)
    }
  } finally { pendingDeletes.delete(id) }
}

/** Merges one Realtime customer row without replacing unrelated dirty forms. */
export const mergeBusinessOsCustomerFromRemote = async (id: string): Promise<void> => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled || !id) return
  const [remoteShared, metrics] = await Promise.all([
    shared.repositories.customersAdmin.getCustomer(id).catch(() => null),
    shared.repositories.customersAdmin.listBusinessMetrics(id).catch(() => []),
  ])
  if (!remoteShared) return
  const remote = fromShared(remoteShared, metrics[0])
  const local = useCustomerStore.getState().customers.find((item) => item.id === id)
  const base = confirmedSnapshots.get(id)
  if (!local || !base || (!inFlight.has(id) && !dirty.has(id) && (local.revision ?? 1) <= (confirmed.get(id) ?? 0))) {
    applyRemote(remoteShared, generation, metrics[0])
    return
  }
  const { merged, conflicts } = mergeCustomer(base, local, remote)
  confirmed.set(id, remote.revision)
  confirmedSnapshots.set(id, remote)
  applyingRemote = true
  try { useCustomerStore.setState((state) => ({ customers: state.customers.map((item) => item.id === id ? merged : item) })) }
  finally { applyingRemote = false }
  if (conflicts.length) { emitConflict(id, conflicts, merged.revision ?? 1); return }
  dirty.add(id)
  void flushCustomer(id)
}

/** Refreshes only server-owned CRM business metrics so Order/payment Realtime
 * cannot overwrite a staff member's unsaved profile fields. */
export const refreshBusinessOsCustomerMetricsFromRemote = async (customerId?: string): Promise<void> => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return
  const metrics = await shared.repositories.customersAdmin.listBusinessMetrics(customerId)
  if (!metrics.length) return
  const metricMap = new Map(metrics.map((metric) => [metric.customerId, metric]))
  applyingRemote = true
  try {
    useCustomerStore.setState((state) => ({
      customers: state.customers.map((customer) => {
        const metric = metricMap.get(customer.id)
        return metric ? {
          ...customer,
          authoritativeLifetimeSpendIdr: metric.lifetimeSpendIdr,
          authoritativeOrderCount: metric.orderCount,
          authoritativeSegment: metric.segment,
        } : customer
      }),
    }))
    for (const [id, metric] of metricMap) {
      const base = confirmedSnapshots.get(id)
      if (base) confirmedSnapshots.set(id, {
        ...base,
        authoritativeLifetimeSpendIdr: metric.lifetimeSpendIdr,
        authoritativeOrderCount: metric.orderCount,
        authoritativeSegment: metric.segment,
      })
    }
  } finally { applyingRemote = false }
}

/** Hydrates CRM and starts row-level, conflict-aware synchronization. */
export const refreshBusinessOsCustomersFromRemote = async (): Promise<boolean> => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) return false
  try {
    const [customers, metrics] = await Promise.all([
      shared.repositories.customersAdmin.listCustomers(),
      shared.repositories.customersAdmin.listBusinessMetrics(),
    ])
    const metricMap = new Map(metrics.map((metric) => [metric.customerId, metric]))
    const mapped = customers.map((customer) => fromShared(customer, metricMap.get(customer.id)))
    stopBusinessOsCustomerBridge()
    const currentGeneration = generation
    applyingRemote = true
    useCustomerStore.setState({ customers: mapped })
    applyingRemote = false
    confirmed = new Map(mapped.map((customer) => [customer.id, customer.revision ?? 1]))
    confirmedSnapshots = new Map(mapped.map((customer) => [customer.id, customer]))

    stopCustomerSync = useCustomerStore.subscribe((state) => {
      if (applyingRemote || currentGeneration !== generation) return
      const currentIds = new Set(state.customers.map((customer) => customer.id))
      for (const [id, expected] of confirmed) if (!currentIds.has(id)) void flushDelete(id, expected)
      for (const customer of state.customers) {
        const expected = confirmed.get(customer.id)
        const conflictRevision = conflictLocalRevisions.get(customer.id)
        if (conflicted.has(customer.id) && conflictRevision !== undefined && (customer.revision ?? 1) > conflictRevision) {
          conflicted.delete(customer.id)
          conflictLocalRevisions.delete(customer.id)
          dirty.add(customer.id)
        }
        if (expected === undefined) {
          confirmed.set(customer.id, 0)
          confirmedSnapshots.set(customer.id, { ...customer, revision: 0 })
          dirty.add(customer.id)
          void flushCustomer(customer.id, currentGeneration)
          continue
        }
        if ((customer.revision ?? 1) > expected) void flushCustomer(customer.id, currentGeneration)
      }
    })
    return true
  } catch {
    applyingRemote = false
    return false
  }
}
