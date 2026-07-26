import { useHrStore } from '../store/hrStore'
import { useUserStore } from '../store/userStore'
import type { AttendanceRecord, Employee, EmployeeDefaultSchedule, ScheduleOverride } from '../store/hrStoreTypes'
import { bootstrapSharedData } from './shared/bootstrap'
import type { Json } from './shared/databaseTypes'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession } from './shared/supabaseSession'
import { getLocalDateString, nowInJakarta } from '../domain/orderTimingDomain'
import { getSupabaseAuthClient } from '../api/supabaseAuth'



const ATTENDANCE_BUCKET = 'attendance-selfies'
const isDataUrl = (value?: string): boolean => Boolean(value?.startsWith('data:image/jpeg;base64,'))
const isRemoteUrl = (value?: string): boolean => Boolean(value && /^https?:\/\//i.test(value))

const uploadAttendanceSelfie = async ({ employeeId, date, kind, dataUrl }: { employeeId: string; date: string; kind: 'checkin' | 'checkout'; dataUrl: string }): Promise<string> => {
  const authClient = getSupabaseAuthClient()
  if (!authClient) throw new Error('Supabase Storage is not configured.')
  const blob = await fetch(dataUrl).then((response) => response.blob())
  if (blob.type !== 'image/jpeg' || blob.size > 102_400) throw new Error('Attendance selfie must be a JPEG no larger than 100 KB.')
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${employeeId}/${date}/${kind}-${nonce}.jpg`
  const { error } = await authClient.storage.from(ATTENDANCE_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' })
  if (error) throw error
  return path
}

const signAttendanceSelfie = async (value?: string): Promise<string | undefined> => {
  if (!value || isDataUrl(value) || isRemoteUrl(value)) return value
  const authClient = getSupabaseAuthClient()
  if (!authClient) return value
  const { data, error } = await authClient.storage.from(ATTENDANCE_BUCKET).createSignedUrl(value, 60 * 60)
  return error ? value : data.signedUrl
}

const signAttendanceRecord = async (record: AttendanceRecord): Promise<AttendanceRecord> => ({
  ...record,
  selfieDataUrl: await signAttendanceSelfie(record.selfieDataUrl),
  checkOutSelfieDataUrl: await signAttendanceSelfie(record.checkOutSelfieDataUrl),
})

interface OperationalRosterItem {
  employeeId: string
  displayName: string
  role: Employee['systemRole']
  profileBranchId?: string | null
  defaultSchedule?: EmployeeDefaultSchedule['days'] | null
  override?: ScheduleOverride['shift'] | null
  overrideNote?: string | null
  overrideWorkMode?: ScheduleOverride['workMode'] | null
  attendance?: AttendanceRecord | null
}

interface StaffOperationsResponse {
  employee?: Employee | null
  employeeDefaultSchedules?: EmployeeDefaultSchedule[]
  scheduleOverrides?: ScheduleOverride[]
  attendance?: AttendanceRecord[]
}

let syncing = false
let stopSubscription: (() => void) | undefined
let lastSerialized = ''
let saveTimer: ReturnType<typeof setTimeout> | undefined

const client = () => bootstrapSharedData(browserSupabaseTokenProvider)
const currentAttendance = (): AttendanceRecord[] => {
  const employeeId = useUserStore.getState().employeeId
  if (!employeeId) return []
  return useHrStore.getState().attendance.filter((item) => item.employeeId === employeeId)
}
const serializedAttendance = (): string => JSON.stringify(currentAttendance())

export const hydrateMyStaffOperations = async (): Promise<boolean> => {
  if (!getSupabaseBrowserSession()) return false
  const boot = client()
  if (!boot.enabled) return false
  const role = useUserStore.getState().role
  const today = getLocalDateString(nowInJakarta())
  const [response, roster] = await Promise.all([
    boot.repositories.client.rpc<StaffOperationsResponse>('get_my_staff_operations', {}),
    role === 'admin'
      ? boot.repositories.client.rpc<OperationalRosterItem[]>('get_operational_roster', { p_date: today, p_branch_id: null })
      : Promise.resolve([]),
  ])
  const signedResponseAttendance = await Promise.all((response.attendance ?? []).map(signAttendanceRecord))
  const signedRosterAttendance = await Promise.all(roster.map((item) => item.attendance).filter((item): item is AttendanceRecord => Boolean(item)).map(signAttendanceRecord))
  syncing = true
  try {
    const employeeId = useUserStore.getState().employeeId
    const rosterEmployees: Employee[] = roster.map((item) => ({
      id: item.employeeId,
      name: item.displayName,
      position: item.role === 'admin' ? 'Admin' : item.role === 'florist' ? 'Florist' : item.role,
      branch: item.profileBranchId ?? '',
      systemRole: item.role,
      status: 'active',
      phone: '',
      hireDate: '',
    }))
    const rosterDefaults: EmployeeDefaultSchedule[] = roster
      .filter((item) => item.defaultSchedule)
      .map((item) => ({ employeeId: item.employeeId, days: item.defaultSchedule!, updatedAt: new Date().toISOString(), updatedBy: 'Supabase' }))
    const rosterOverrides: ScheduleOverride[] = roster
      .filter((item) => item.override)
      .map((item) => ({ id: `roster-${item.employeeId}-${today}`, employeeId: item.employeeId, date: today, shift: item.override!, note: item.overrideNote ?? undefined, workMode: item.overrideWorkMode ?? undefined, updatedAt: new Date().toISOString(), updatedBy: 'Supabase' }))
    const rosterAttendance = signedRosterAttendance
    useHrStore.setState((state) => {
      const incomingEmployees = [...(response.employee ? [response.employee] : []), ...rosterEmployees]
      const incomingIds = new Set(incomingEmployees.map((item) => item.id))
      const scheduleIds = new Set([employeeId, ...roster.map((item) => item.employeeId)].filter(Boolean) as string[])
      return {
        employees: [...incomingEmployees, ...state.employees.filter((item) => !incomingIds.has(item.id))],
        employeeDefaultSchedules: [
          ...(response.employeeDefaultSchedules ?? []),
          ...rosterDefaults,
          ...state.employeeDefaultSchedules.filter((item) => !scheduleIds.has(item.employeeId)),
        ],
        scheduleOverrides: [
          ...(response.scheduleOverrides ?? []),
          ...rosterOverrides,
          ...state.scheduleOverrides.filter((item) => !scheduleIds.has(item.employeeId) || item.date !== today),
        ],
        attendance: [
          ...signedResponseAttendance,
          ...rosterAttendance,
          ...state.attendance.filter((item) => !scheduleIds.has(item.employeeId) || item.date !== today),
        ],
      }
    })
    lastSerialized = serializedAttendance()
  } finally { syncing = false }
  return true
}

const persistLatestAttendance = async (): Promise<void> => {
  if (syncing || !getSupabaseBrowserSession()) return
  const boot = client()
  if (!boot.enabled) return
  const records = currentAttendance()
  const serialized = JSON.stringify(records)
  if (serialized === lastSerialized) return
  const previous = lastSerialized
  lastSerialized = serialized
  try {
    const latest = [...records].sort((a,b) => b.date.localeCompare(a.date) || (b.checkOutAt ?? b.checkInAt ?? '').localeCompare(a.checkOutAt ?? a.checkInAt ?? ''))[0]
    if (latest) {
      const serverRecord: AttendanceRecord = { ...latest }
      try {
        if (isDataUrl(latest.selfieDataUrl)) {
          serverRecord.selfieDataUrl = await uploadAttendanceSelfie({ employeeId: latest.employeeId, date: latest.date, kind: 'checkin', dataUrl: latest.selfieDataUrl! })
        }
        if (isDataUrl(latest.checkOutSelfieDataUrl)) {
          serverRecord.checkOutSelfieDataUrl = await uploadAttendanceSelfie({ employeeId: latest.employeeId, date: latest.date, kind: 'checkout', dataUrl: latest.checkOutSelfieDataUrl! })
        }
        const response = await boot.repositories.client.rpc<{ record: AttendanceRecord }>('save_my_attendance_record', { p_record: serverRecord as unknown as Json })
        if (response.record) {
          const displayRecord = await signAttendanceRecord(response.record)
          syncing = true
          try {
            useHrStore.setState((state) => ({
              attendance: [displayRecord, ...state.attendance.filter((item) => !(item.employeeId === displayRecord.employeeId && item.date === displayRecord.date))],
            }))
            lastSerialized = serializedAttendance()
          } finally { syncing = false }
        }
      } catch (error) {
        // Do not delete an uploaded selfie after an RPC/network failure: the
        // database mutation may already have committed and now reference that
        // object. Orphan cleanup is safer than breaking a committed attendance
        // record after an ambiguous client error.
        throw error
      }
    }
  } catch (error) {
    lastSerialized = previous
    console.error('Unable to save staff attendance.', error)
  }
}

const scheduleSave = (): void => {
  if (syncing) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { saveTimer = undefined; void persistLatestAttendance() }, 250)
}

export const connectStaffOperationsSupabase = async (): Promise<boolean> => {
  const hydrated = await hydrateMyStaffOperations()
  if (!hydrated) return false
  const role = useUserStore.getState().role
  if ((role === 'admin' || role === 'florist') && !stopSubscription) {
    stopSubscription = useHrStore.subscribe(scheduleSave)
  }
  return true
}

export const stopStaffOperationsSupabase = (): void => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  stopSubscription?.()
  stopSubscription = undefined
  lastSerialized = ''
}
