import type { PayrollSettingsRevision, SchedulingSettingsRevision } from '../domain/settings/effectiveSettingsDomain'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'
import { useSettingsStore } from '../store/settingsStore'
import { useUserStore } from '../store/userStore'
import { useCustomerStore } from '../store/customerStore'
import type { CustomerSegmentRules } from '../store/customerStoreTypes'
import type { AttendanceSettings, PayrollDefaultSettings, SchedulingSettings, StaffRoleSettings } from '../types/settings'
import { bootstrapSharedData } from './shared/bootstrap'
import type { Json } from './shared/databaseTypes'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession } from './shared/supabaseSession'
import { SupabaseHttpError } from './shared/supabaseHttpClient'
import { toast } from '../hooks/use-toast'

type InternalSettingsResponse = {
  revision: number
  staffRoles: StaffRoleSettings | null
  attendance: AttendanceSettings | null
  scheduling: SchedulingSettings | null
  payroll: PayrollDefaultSettings | null
  schedulingRevisions: SchedulingSettingsRevision[] | null
  payrollRevisions: PayrollSettingsRevision[] | null
  customerSegments: CustomerSegmentRules | null
  updatedAt?: string | null
}

type InternalSettingsPayload = {
  staffRoles: StaffRoleSettings
  attendance: AttendanceSettings
  scheduling: SchedulingSettings
  payroll: PayrollDefaultSettings
  schedulingRevisions: SchedulingSettingsRevision[]
  payrollRevisions: PayrollSettingsRevision[]
  customerSegments: CustomerSegmentRules
}

let revision = 1
let syncing = false
let stopSubscription: (() => void) | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let lastSerialized = ''

const client = () => bootstrapSharedData(browserSupabaseTokenProvider)

const localPayload = (): InternalSettingsPayload => {
  const state = useSettingsStore.getState()
  const customerState = useCustomerStore.getState()
  return {
    staffRoles: state.staffRoles,
    attendance: state.attendance,
    scheduling: state.scheduling,
    payroll: state.payroll,
    schedulingRevisions: state.schedulingConfigRevisions,
    payrollRevisions: state.payrollConfigRevisions,
    customerSegments: customerState.segmentRules,
  }
}

const serialize = (value: InternalSettingsPayload): string => JSON.stringify(value)

const applyRemote = (remote: InternalSettingsResponse): void => {
  syncing = true
  try {
    useSettingsStore.setState((state) => ({
      staffRoles: remote.staffRoles ?? state.staffRoles ?? DEFAULT_OWNER_SETTINGS.staffRoles,
      attendance: remote.attendance ?? state.attendance ?? DEFAULT_OWNER_SETTINGS.attendance,
      scheduling: remote.scheduling ?? state.scheduling ?? DEFAULT_OWNER_SETTINGS.scheduling,
      payroll: remote.payroll ?? state.payroll ?? DEFAULT_OWNER_SETTINGS.payroll,
      schedulingConfigRevisions: remote.schedulingRevisions?.length ? remote.schedulingRevisions : state.schedulingConfigRevisions,
      payrollConfigRevisions: remote.payrollRevisions?.length ? remote.payrollRevisions : state.payrollConfigRevisions,
    }))
    if (remote.customerSegments) useCustomerStore.setState({ segmentRules: remote.customerSegments })
    revision = Math.max(1, Number(remote.revision) || 1)
    lastSerialized = serialize(localPayload())
  } finally {
    syncing = false
  }
}

const isRevisionConflict = (error: unknown): boolean =>
  error instanceof SupabaseHttpError &&
  (error.message.includes('REVISION_CONFLICT:internal_settings') ||
    (typeof error.payload === 'object' && error.payload !== null && 'code' in error.payload && error.payload.code === '40001'))

export const hydrateInternalSettingsFromSupabase = async (): Promise<boolean> => {
  if (!getSupabaseBrowserSession()) return false
  const boot = client()
  if (!boot.enabled) return false
  const remote = await boot.repositories.client.rpc<InternalSettingsResponse>('get_internal_settings_config', {})
  applyRemote(remote)
  return true
}

const persistInternalSettings = async (): Promise<void> => {
  if (syncing || useUserStore.getState().role !== 'owner' || !getSupabaseBrowserSession()) return
  const boot = client()
  if (!boot.enabled) return
  const payload = localPayload()
  const serialized = serialize(payload)
  if (serialized === lastSerialized) return

  try {
    const remote = await boot.repositories.client.rpc<InternalSettingsResponse>('save_internal_settings_config', {
      p_expected_revision: revision,
      p_staff_roles: payload.staffRoles as unknown as Json,
      p_attendance: payload.attendance as unknown as Json,
      p_scheduling: payload.scheduling as unknown as Json,
      p_payroll: payload.payroll as unknown as Json,
      p_customer_segments: payload.customerSegments as unknown as Json,
      p_scheduling_revisions: payload.schedulingRevisions as unknown as Json,
      p_payroll_revisions: payload.payrollRevisions as unknown as Json,
    })
    applyRemote(remote)
  } catch (error) {
    if (isRevisionConflict(error)) {
      void boot.repositories.client.rpc('record_mutation_conflict', {
        p_action: 'internal_settings.save',
        p_entity_type: 'internal_settings',
        p_entity_id: 'primary',
        p_expected_revision: revision,
        p_observed_revision: undefined,
      }).catch(() => undefined)
      await hydrateInternalSettingsFromSupabase().catch(() => undefined)
      toast({
        title: 'Settings not saved',
        description: 'Settings changed in another session. The latest values were reloaded; reapply your change.',
      })
      return
    }
    console.error('Unable to save Fleurstales internal settings.', error)
    toast({
      title: 'Settings not saved',
      description: error instanceof Error ? error.message : 'Unable to save settings.',
    })
  }
}

const scheduleSave = (): void => {
  if (syncing || useUserStore.getState().role !== 'owner') return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    void persistInternalSettings()
  }, 250)
}

export const startInternalSettingsSupabaseSync = (): void => {
  if (stopSubscription || useUserStore.getState().role !== 'owner') return
  lastSerialized = serialize(localPayload())
  const stopSettings = useSettingsStore.subscribe(scheduleSave)
  const stopCustomer = useCustomerStore.subscribe(scheduleSave)
  stopSubscription = () => { stopSettings(); stopCustomer() }
}

export const stopInternalSettingsSupabaseSync = (): void => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  stopSubscription?.()
  stopSubscription = undefined
}

export const connectInternalSettingsSupabase = async (): Promise<boolean> => {
  try {
    const hydrated = await hydrateInternalSettingsFromSupabase()
    if (!hydrated) return false
    startInternalSettingsSupabaseSync()
    return true
  } catch (error) {
    console.error('Unable to hydrate Fleurstales internal settings.', error)
    return false
  }
}
