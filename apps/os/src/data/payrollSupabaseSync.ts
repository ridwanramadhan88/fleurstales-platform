import { usePayrollStore } from '../store/payrollStore'
import { useUserStore } from '../store/userStore'
import { useSettingsStore } from '../store/settingsStore'
import { hasActionPermission } from '../config/actionPermissions'
import { bootstrapSharedData } from './shared/bootstrap'
import type { Json } from './shared/databaseTypes'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession } from './shared/supabaseSession'
import { SupabaseHttpError } from './shared/supabaseHttpClient'
import { subscribePayrollWorkflowMutations, type PayrollWorkflowCommand } from './payrollWorkflowEvents'

type PayrollStateResponse = {
  domain: 'payroll'
  revision: number
  snapshot: Json | null
  updatedAt: string | null
}

const RPC_BY_COMMAND: Record<PayrollWorkflowCommand, string> = {
  set_compensation: 'payroll_set_compensation',
  prepare: 'payroll_prepare',
  generate: 'payroll_generate',
  submit: 'payroll_submit',
  resolve_rejected: 'payroll_resolve_rejected',
  approve_employee: 'payroll_approve_employee',
  reject_employee: 'payroll_reject_employee',
  approve_all: 'payroll_approve_all',
  record_payment: 'payroll_record_payment',
  adjust_schedule: 'payroll_adjust_schedule',
}

let revision = 0
let syncing = false
let stopListener: (() => void) | undefined
let queue: Promise<void> = Promise.resolve()

const client = () => bootstrapSharedData(browserSupabaseTokenProvider)

const canReadPayroll = (): boolean => {
  const role = useUserStore.getState().role
  const settings = useSettingsStore.getState()
  return role === 'owner'
    || hasActionPermission(role, 'finance.view_payroll', settings.actionPermissions, settings.permissions)
    || hasActionPermission(role, 'hr.create_payroll_proposal', settings.actionPermissions, settings.permissions)
    || hasActionPermission(role, 'hr.edit_payroll_proposal', settings.actionPermissions, settings.permissions)
    || hasActionPermission(role, 'hr.resolve_rejected_employee', settings.actionPermissions, settings.permissions)
}
const dataOnly = (state: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function'))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const snapshot = (): Json => dataOnly(usePayrollStore.getState() as unknown as Record<string, unknown>) as Json

const applyRemote = (response: PayrollStateResponse): void => {
  revision = Math.max(0, Number(response.revision) || 0)
  if (!isRecord(response.snapshot)) return
  syncing = true
  try {
    usePayrollStore.setState(response.snapshot as never, false)
  } finally {
    syncing = false
  }
}

const isConflict = (error: unknown): boolean =>
  error instanceof SupabaseHttpError &&
  (error.message.includes('REVISION_CONFLICT:payroll') ||
    (typeof error.payload === 'object' && error.payload !== null && 'code' in error.payload && error.payload.code === '40001'))

export const hydratePayrollFromSupabase = async (): Promise<boolean> => {
  if (!getSupabaseBrowserSession()) return false
  const boot = client()
  if (!boot.enabled) return false
  const response = await boot.repositories.client.rpc<PayrollStateResponse>('get_operational_domain_state', { p_domain: 'payroll' })
  applyRemote(response)
  return response.snapshot !== null
}

const persistCommand = async (command: PayrollWorkflowCommand): Promise<void> => {
  if (syncing || !getSupabaseBrowserSession()) return
  const boot = client()
  if (!boot.enabled) return
  const expectedRevision = revision
  try {
    const response = await boot.repositories.client.rpc<PayrollStateResponse>(RPC_BY_COMMAND[command], {
      p_expected_revision: expectedRevision,
      p_snapshot: snapshot(),
    })
    revision = response.revision
  } catch (error) {
    if (isConflict(error) || error instanceof SupabaseHttpError) {
      if (isConflict(error)) {
        void boot.repositories.client.rpc('record_mutation_conflict', {
          p_action: 'payroll.save',
          p_entity_type: 'payroll',
          p_entity_id: 'primary',
          p_expected_revision: expectedRevision,
          p_observed_revision: undefined,
        }).catch(() => undefined)
      }
      // The server owns payroll authority. Rejected/stale local state is
      // replaced instead of being retried as a last-write-wins snapshot.
      await hydratePayrollFromSupabase().catch(() => undefined)
      return
    }
    console.error(`Unable to persist payroll command ${command}.`, error)
  }
}

export const startPayrollSupabaseSync = (): void => {
  if (stopListener) return
  stopListener = subscribePayrollWorkflowMutations((command) => {
    if (syncing) return
    queue = queue.then(() => persistCommand(command)).catch(() => undefined)
  })
}

export const stopPayrollSupabaseSync = (): void => {
  stopListener?.()
  stopListener = undefined
  queue = Promise.resolve()
}

export const connectPayrollSupabase = async (): Promise<boolean> => {
  if (!canReadPayroll()) return true
  try {
    const hydrated = await hydratePayrollFromSupabase()
    if (!hydrated) return false
    startPayrollSupabaseSync()
    return true
  } catch (error) {
    console.error('Unable to hydrate Fleurstales payroll state.', error)
    return false
  }
}
