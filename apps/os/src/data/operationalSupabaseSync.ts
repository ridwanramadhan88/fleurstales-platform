import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession } from './shared/supabaseSession'
import type { Json } from './shared/databaseTypes'
import { migrateOperationalSnapshot, OPERATIONAL_SCHEMA_VERSION, type OperationalSnapshot } from '../store/operationalPersistence'
import { useHrStore } from '../store/hrStore'
import { usePayrollStore } from '../store/payrollStore'
import { useFinanceStore } from '../store/financeStore'
import { useStockStore } from '../store/stockStore'
import { useVoucherStore } from '../store/voucherStore'
import { useNotificationStore } from '../store/notificationStore'
import { useOrderRuntimeStore } from '../store/orderRuntimeStore'
import { useAuditLogStore } from '../store/auditLogStore'
import { readOrderDraftRecords, writeOrderDraftRecords } from '../store/orderDraftPersistence'

type Slice = Record<string, unknown>
const dataOnly = (state: Record<string, unknown>): Slice => Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function'))
const isRecord = (value: unknown): value is Slice => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
let unsubscribers: Array<() => void> = []
let syncing = false

const remoteSnapshot = (nextRevision = revision + 1): OperationalSnapshot => {
  const hr = dataOnly(useHrStore.getState() as unknown as Record<string, unknown>)
  // PINs are local authentication secrets and must never be copied to JSONB.
  if (Array.isArray(hr.employees)) hr.employees = hr.employees.map((employee) => {
    if (!isRecord(employee)) return employee
    const { pin: _pin, ...safeEmployee } = employee
    return safeEmployee
  })
  return {
    version: OPERATIONAL_SCHEMA_VERSION,
    revision: nextRevision,
    savedAt: new Date().toISOString(),
    state: {
      hr,
      payroll: dataOnly(usePayrollStore.getState() as unknown as Record<string, unknown>),
      finance: dataOnly(useFinanceStore.getState() as unknown as Record<string, unknown>),
      stock: dataOnly(useStockStore.getState() as unknown as Record<string, unknown>),
      vouchers: dataOnly(useVoucherStore.getState() as unknown as Record<string, unknown>),
      notifications: dataOnly(useNotificationStore.getState() as unknown as Record<string, unknown>),
      orderActivities: dataOnly(useOrderRuntimeStore.getState() as unknown as Record<string, unknown>),
      auditLog: dataOnly(useAuditLogStore.getState() as unknown as Record<string, unknown>),
      orderDrafts: readOrderDraftRecords<unknown>(),
    },
  }
}

const client = () => bootstrapSharedData(browserSupabaseTokenProvider)

export const hydrateOperationalStateFromSupabase = async (): Promise<boolean> => {
  if (!getSupabaseBrowserSession()) return false
  const boot = client()
  if (!boot.enabled) return false
  const rows = await boot.repositories.client.select('operational_state', { filters: { id: 'primary' }, limit: 1 })
  const row = rows[0]
  if (!row) {
    await persistOperationalStateToSupabase()
    return false
  }
  const snapshot = migrateOperationalSnapshot(row.snapshot)
  if (!snapshot) return false
  const localEmployees = useHrStore.getState().employees
  const remoteHr = isRecord(snapshot.state.hr) ? { ...snapshot.state.hr } : undefined
  if (remoteHr && Array.isArray(remoteHr.employees)) {
    remoteHr.employees = remoteHr.employees.map((employee) => {
      if (!isRecord(employee)) return employee
      const local = localEmployees.find((candidate) => candidate.id === employee.id)
      return local ? { ...employee, pin: local.pin } : employee
    })
  }
  syncing = true
  try {
    if (remoteHr) useHrStore.setState(remoteHr as never, false)
    if (isRecord(snapshot.state.payroll)) usePayrollStore.setState(snapshot.state.payroll as never, false)
    if (isRecord(snapshot.state.finance)) useFinanceStore.setState(snapshot.state.finance as never, false)
    if (isRecord(snapshot.state.stock)) useStockStore.setState(snapshot.state.stock as never, false)
    if (isRecord(snapshot.state.vouchers)) useVoucherStore.setState(snapshot.state.vouchers as never, false)
    if (isRecord(snapshot.state.notifications)) useNotificationStore.setState(snapshot.state.notifications as never, false)
    if (isRecord(snapshot.state.orderActivities)) useOrderRuntimeStore.setState(snapshot.state.orderActivities as never, false)
    if (isRecord(snapshot.state.auditLog)) useAuditLogStore.setState(snapshot.state.auditLog as never, false)
    if (Array.isArray(snapshot.state.orderDrafts)) writeOrderDraftRecords(snapshot.state.orderDrafts)
    revision = snapshot.revision
  } finally { syncing = false }
  return true
}

export const persistOperationalStateToSupabase = async (): Promise<void> => {
  if (syncing || !getSupabaseBrowserSession()) return
  const boot = client()
  if (!boot.enabled) return
  const snapshot = remoteSnapshot()
  await boot.repositories.client.upsert('operational_state', {
    id: 'primary', revision: snapshot.revision, snapshot: snapshot as unknown as Json,
    updated_by: getSupabaseBrowserSession()?.userId ?? null, updated_at: snapshot.savedAt,
  }, 'id')
  revision = snapshot.revision
}

const schedule = () => {
  if (syncing || !getSupabaseBrowserSession()) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = undefined; void persistOperationalStateToSupabase() }, 350)
}

export const startOperationalSupabaseSync = () => {
  if (unsubscribers.length) return
  unsubscribers = [useHrStore, usePayrollStore, useFinanceStore, useStockStore, useVoucherStore, useNotificationStore, useOrderRuntimeStore, useAuditLogStore].map((store) => store.subscribe(schedule))
}

export const stopOperationalSupabaseSync = () => {
  if (timer) clearTimeout(timer)
  timer = undefined
  unsubscribers.forEach((unsubscribe) => unsubscribe())
  unsubscribers = []
}

export const connectOperationalSupabase = async () => {
  await hydrateOperationalStateFromSupabase()
  startOperationalSupabaseSync()
}
