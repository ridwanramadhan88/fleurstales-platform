/**
 * @file hrStore.ts
 * @description Lightweight in-memory HR store with:
 * - Employee accounts (position, branch, status).
 * - Daily attendance records.
 *
 * This file is the data layer (single source of truth) and only contains:
 * - Raw state.
 * - CRUD-style mutations.
 *
 * All business / derived logic (summaries, filters) lives in the domain
 * layer (see src/domain/hrDomain.ts).
 */

import { create } from 'zustand'

const TEST_RUNTIME = (globalThis as typeof globalThis & { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV === 'test'

import type { BranchId, OrderTableRow } from '../types/orders'
import type { UserRole } from './userStore'
import { getLocalDateString, nowInJakarta } from '../domain/orderTimingDomain'
import { canRecordAttendance, canRecordSelfieAttendance, canRecordSelfieCheckOut, canSetEmployeeActiveState, type HrActor } from '../domain/hrStatusDomain'
import { canChangeEmployeeRole, canCreateStaffAccount, normalizeUsername } from '../domain/staffAccountDomain'
import { isStrongStaffPassword, STAFF_PASSWORD_HELP } from '../domain/staffCredentialDomain'
import { useSettingsStore } from './settingsStore'
import { canEditScheduling, getEffectiveScheduleForDate, getMondayForDate, getWeekdayKey, materializeScheduleShift, toIsoDate, validateScheduleShift } from '../domain/hrSchedulingDomain'
import { findNearestAttendanceBranch, type GeoPoint } from '../domain/attendanceLocationDomain'
import { buildAttendanceWarnings, buildCheckoutWarnings, minutesFromTime, shouldCreateMissingCheckoutWarning } from '../domain/attendanceReviewDomain'
import { buildDeliveryLateWarnings } from '../domain/employeeWarningDomain'
import { buildExpectedOrderContributions, DEFAULT_ORDER_CONTRIBUTION_RULES, validateOrderContributionRules, type OrderContributionRules } from '../domain/orderContributionPointsDomain'
import { getPayrollPeriodIdForActivityDate } from '../domain/payrollScheduleDomain'
import { canActorManageEmployee, isHrManagedEmployee, isHrManagedEmployeeRole, HR_PROTECTED_ROLE_MESSAGE } from '../domain/hrManagedEmployeeDomain'
import { isActionAuthorized } from '../config/authorization'
import { isSharedBackendConfigured } from '../api/remoteSession'
import { isSupabaseConfigured } from '../data/shared/supabaseConfig'
import { getEmployeeRemovalBlockers, isEmployeeOperationallyReady } from '../domain/hrEmployeeLifecycleDomain'
import type {
  Employee,
  EmployeeStatus,
  AttendanceRecord,
  AttendanceStatus,
  EmployeeDefaultSchedule,
  ScheduleOverride,
  ScheduleShift,
  AttendanceReviewCase,
  AttendanceReviewDecision,
  EmployeePointEntry,
  WeeklySchedulePublication,
  ScheduleRevision,
} from './hrStoreTypes'


export type HrEmployeeCommandField = 'name' | 'phone' | 'hireDate' | 'branch' | 'systemRole' | 'email' | 'username' | 'pin' | 'baseSalaryIdr'
export type HrEmployeeCommandResult =
  | { ok: true; employeeId: string }
  | { ok: false; code: 'not_found' | 'forbidden' | 'invalid_name' | 'invalid_phone' | 'invalid_hire_date' | 'future_hire_date' | 'invalid_branch' | 'disabled_role' | 'invalid_email' | 'duplicate_email' | 'invalid_username' | 'duplicate_username' | 'invalid_pin' | 'last_owner' | 'unknown'; reason: string; fieldErrors?: Partial<Record<HrEmployeeCommandField, string>> }

export type HrEmployeeRemovalResult =
  | { ok:true; employeeId:string }
  | { ok:false; code:'not_found'|'forbidden'|'reason_required'|'history_exists'; reason:string }

export type HrScheduleCommandResult =
  | { ok: true; affected: number }
  | { ok: false; code: 'forbidden' | 'not_found' | 'inactive_employee' | 'invalid_branch' | 'invalid_shift' | 'invalid_date' | 'empty_selection' | 'unsupported' | 'incomplete_schedule' | 'invalid_weekly_rest' | 'too_many_workdays' | 'coverage_warning' | 'insufficient_hr_visits'; reason: string }

const employeeCommandError = (
  code: Exclude<HrEmployeeCommandResult, { ok: true }>['code'],
  reason: string,
  field?: HrEmployeeCommandField,
): HrEmployeeCommandResult => ({ ok: false, code, reason, fieldErrors: field ? { [field]: reason } : undefined })

/**
 * @description Internal state for the HR store (raw data + CRUD only).
 */
interface HrStoreState {
  employees: Employee[]
  attendance: AttendanceRecord[]
  employeeDefaultSchedules: EmployeeDefaultSchedule[]
  scheduleOverrides: ScheduleOverride[]
  weeklySchedulePublications: WeeklySchedulePublication[]
  scheduleRevisions: ScheduleRevision[]
  attendanceReviewCases: AttendanceReviewCase[]
  employeePointEntries: EmployeePointEntry[]
  pointRules: OrderContributionRules
  /**
   * @description Adds a new employee record.
   */
  addEmployee: (params: {
    name: string
    position: string
    branch?: BranchId
    systemRole: UserRole
    phone: string
    hireDate: string
    actor: HrActor
  }) => HrEmployeeCommandResult
  createStaffAccount: (params: {
    name: string
    position: string
    branch?: BranchId
    systemRole: UserRole
    phone: string
    hireDate: string
    employeeId?: string
    email?: string
    username?: string
    pin?: string
    productionAuth?: boolean
    baseSalaryIdr?: number
    actor: HrActor
  }) => HrEmployeeCommandResult
  updateEmployeeRole: (employeeId: string, nextRole: UserRole, actor: HrActor) => HrEmployeeCommandResult
  updateEmployeeBaseSalary: (employeeId: string, baseSalaryIdr: number, actor: HrActor) => HrEmployeeCommandResult
  updateEmployeeProfile: (params: {
    employeeId: string
    name: string
    phone: string
    hireDate: string
    actor: HrActor
  }) => HrEmployeeCommandResult
  updateEmployeeAccess: (params: {
    employeeId: string
    branch?: BranchId
    systemRole: UserRole
    email?: string
    username?: string
    pin?: string
    productionAuth?: boolean
    actor: HrActor
  }) => HrEmployeeCommandResult
  activateEmployee: (employeeId: string, actor: HrActor) => boolean
  deactivateEmployee: (employeeId: string, actor: HrActor) => boolean
  removeUnusedEmployee: (params: { employeeId:string; reason:string; actor:HrActor }) => HrEmployeeRemovalResult
  /**
   * @description Sets or overwrites today's (or a given date's) attendance
   * status for one employee. Idempotent per employee+date.
   */
  recordAttendance: (params: {
    employeeId: string
    date: string
    status: AttendanceStatus
    note?: string
    reviewCaseId?: string
    actor: HrActor
  }) => boolean

  saveEmployeeDefaultSchedule: (params: {
    employeeId: string
    days: EmployeeDefaultSchedule['days']
    actor: HrActor
  }) => HrScheduleCommandResult
  clearEmployeeDefaultSchedule: (params: { employeeId: string; actor: HrActor }) => HrScheduleCommandResult
  setScheduleOverride: (params: {
    employeeId: string
    date: string
    shift: ScheduleShift
    note?: string
    workMode?: 'onsite' | 'wfh'
    actor: HrActor
  }) => HrScheduleCommandResult
  clearScheduleOverride: (params: { employeeId: string; date: string; actor: HrActor }) => HrScheduleCommandResult
  bulkSetScheduleOverrides: (params: {
    employeeIds: string[]
    dates: string[]
    shift: ScheduleShift
    note?: string
    workMode?: 'onsite' | 'wfh'
    actor: HrActor
  }) => HrScheduleCommandResult
  generateWeekFromDefaults: (params: { weekStart:string; branchId:BranchId|'All'; actor:HrActor }) => HrScheduleCommandResult
  copyPreviousScheduleWeek: (params: { weekStart:string; branchId:BranchId|'All'; actor:HrActor }) => HrScheduleCommandResult
  resetScheduleWeekToDefaults: (params: { weekStart:string; branchId:BranchId|'All'; actor:HrActor }) => HrScheduleCommandResult
  publishScheduleWeek: (params: { weekStart:string; branchId:BranchId|'All'; actor:HrActor; allowCoverageShortage?:boolean; coverageShortageReason?:string }) => HrScheduleCommandResult
  recordSelfieAttendance: (params: {
    employeeId: string
    selfieDataUrl: string
    actor: HrActor
    location?: GeoPoint
  }) => { ok: true } | { ok: false; reason: string }
  recordSelfieCheckOut: (params: {
    employeeId: string
    selfieDataUrl: string
    actor: HrActor
    location?: GeoPoint
  }) => { ok: true } | { ok: false; reason: string }
  generateAttendanceWarnings: (now?: Date) => number
  generateOrderWarnings: (orders: OrderTableRow[]) => number
  reviewAttendanceCase: (params: { caseId:string; decision:AttendanceReviewDecision; note?:string; actor:HrActor; proposedMinusPoints?:number }) => { ok:true } | { ok:false; reason:string }
  createManualPointAdjustment: (params: { employeeId:string; points:number; reason:string; actor:HrActor }) => { ok:true; entryId:string } | { ok:false; reason:string }
  approvePointEntry: (params: { entryId:string; note?:string; actor:HrActor }) => { ok:true } | { ok:false; reason:string }
  rejectPointEntry: (params: { entryId:string; note:string; actor:HrActor }) => { ok:true } | { ok:false; reason:string }
  reversePointEntry: (params: { entryId:string; reason:string; actor:HrActor }) => { ok:true; reversalEntryId:string } | { ok:false; reason:string }
  updatePointRules: (params: { rules:OrderContributionRules; actor:HrActor }) => { ok:true } | { ok:false; reason:string; field?:keyof OrderContributionRules }
  syncOrderContributionPoints: (params: { orders:OrderTableRow[]; actor:HrActor }) => { ok:true; created:number; reversed:number } | { ok:false; reason:string }
}

/**
 * @description Returns a compact ISO timestamp string for "now".
 */
const nowIso = (): string => new Date().toISOString()

const validateEmployeeScheduleShift = (employee: Pick<Employee,'systemRole'>, shift: ScheduleShift, branch: ReturnType<typeof useSettingsStore.getState>['branches'][number] | undefined, date: string): string | null => {
  if (employee.systemRole === 'admin' && shift.isWorking && shift.branchId === 'Kedamaian' && shift.startTime === '07:30' && shift.endTime === '16:30') return null
  return validateScheduleShift({ shift, branch, weekday:getWeekdayKey(date) })
}

export const getEmployeeRoleLabel = (role: UserRole): string => ({
  owner: 'Owner', admin: 'Admin', finance: 'Finance', hr: 'HR', florist: 'Florist',
}[role])

/**
 * @description Returns today's date as YYYY-MM-DD.
 */
export const todayIsoDate = (): string => getLocalDateString(nowInJakarta())

/**
 * @description Operational staff accounts. Admins and Florists have no permanent branch.
 */
const INITIAL_EMPLOYEES: Employee[] = TEST_RUNTIME ? [
  { id:'emp-budi', name:'Budi', position:'Owner', branch:'', systemRole:'owner', status:'active', phone:'', hireDate:'2021-01-10', username:'owner', pin:'Fleur1', baseSalaryIdr:7_000_000 },
  { id:'emp-dewi', name:'Dewi', position:'Finance', branch:'', systemRole:'finance', status:'active', phone:'', hireDate:'2023-06-01', username:'finance', pin:'Fleur1', baseSalaryIdr:5_000_000 },
  { id:'emp-bintang', name:'Bintang', position:'HR', branch:'', systemRole:'hr', status:'active', phone:'', hireDate:'2024-01-15', username:'hr', pin:'Fleur1', baseSalaryIdr:4_500_000 },
  { id:'emp-akbar', name:'Akbar', position:'Admin', branch:'', systemRole:'admin', status:'active', phone:'', hireDate:'2024-01-01', username:'akbar', pin:'Fleur1', baseSalaryIdr:4_500_000 },
  { id:'emp-teta', name:'Teta', position:'Admin', branch:'', systemRole:'admin', status:'active', phone:'', hireDate:'2024-01-01', username:'teta', pin:'Fleur1', baseSalaryIdr:4_500_000 },
  { id:'emp-shofi', name:'Shofi', position:'Admin', branch:'', systemRole:'admin', status:'active', phone:'', hireDate:'2024-01-01', username:'shofi', pin:'Fleur1', baseSalaryIdr:4_500_000 },
  { id:'emp-zahra', name:'Zahra', position:'Florist', branch:'', systemRole:'florist', status:'active', phone:'', hireDate:'2024-01-01', username:'zahra', pin:'Fleur1', baseSalaryIdr:4_000_000 },
  { id:'emp-vero', name:'Vero', position:'Florist', branch:'', systemRole:'florist', status:'active', phone:'', hireDate:'2024-01-01', username:'vero', pin:'Fleur1', baseSalaryIdr:4_000_000 },
  { id:'emp-zizi', name:'Zizi', position:'Florist', branch:'', systemRole:'florist', status:'active', phone:'', hireDate:'2024-01-01', username:'zizi', pin:'Fleur1', baseSalaryIdr:4_000_000 },
  { id:'emp-dela', name:'Dela', position:'Florist', branch:'', systemRole:'florist', status:'active', phone:'', hireDate:'2024-01-01', username:'dela', pin:'Fleur1', baseSalaryIdr:4_000_000 },
  { id:'emp-dila', name:'Dila', position:'Florist', branch:'', systemRole:'florist', status:'active', phone:'', hireDate:'2024-01-01', username:'dila', pin:'Fleur1', baseSalaryIdr:4_000_000 },
  { id:'emp-gaby', name:'Gaby', position:'Florist', branch:'', systemRole:'florist', status:'active', phone:'', hireDate:'2024-01-01', username:'gaby', pin:'Fleur1', baseSalaryIdr:4_000_000 },
] : []

const historicalShift = (employeeId:string,date:string,branchId:string,startTime:string,endTime:string,isWorking=true):ScheduleOverride => ({
  id:`schedule-${employeeId}-${date}`,
  employeeId,date,
  shift:{mode:isWorking?'custom':'off',isWorking,startTime:isWorking?startTime:'',endTime:isWorking?endTime:'',branchId},
  note:isWorking?'Imported from July 2026 roster':'Weekly rest · imported from July 2026 roster',
  updatedAt:'2026-07-20T00:00:00.000Z',updatedBy:'Schedule import',
})

const KDM_F = (id:string,date:string)=>historicalShift(id,date,'Kedamaian','07:00','16:00')
const KDM_A = (id:string,date:string)=>historicalShift(id,date,'Kedamaian','07:30','16:30')
const PHM = (id:string,date:string)=>historicalShift(id,date,'Pahoman','10:00','19:00')
const OFF = (id:string,date:string)=>historicalShift(id,date,'Kedamaian','','',false)

/** Real July 2026 roster imported as dated history; it never becomes a default branch pattern. */
const INITIAL_SCHEDULE_OVERRIDES: ScheduleOverride[] = [
  PHM('emp-zahra','2026-07-06'),PHM('emp-zahra','2026-07-07'),PHM('emp-zahra','2026-07-08'),PHM('emp-zahra','2026-07-09'),PHM('emp-zahra','2026-07-10'),OFF('emp-zahra','2026-07-11'),PHM('emp-zahra','2026-07-12'),
  KDM_A('emp-akbar','2026-07-06'),OFF('emp-akbar','2026-07-07'),KDM_A('emp-akbar','2026-07-08'),KDM_A('emp-akbar','2026-07-09'),KDM_A('emp-akbar','2026-07-10'),KDM_A('emp-akbar','2026-07-11'),PHM('emp-akbar','2026-07-12'),
  KDM_F('emp-vero','2026-07-06'),KDM_F('emp-vero','2026-07-07'),KDM_F('emp-vero','2026-07-08'),KDM_F('emp-vero','2026-07-09'),KDM_F('emp-vero','2026-07-10'),KDM_F('emp-vero','2026-07-11'),OFF('emp-vero','2026-07-12'),
  OFF('emp-zizi','2026-07-06'),OFF('emp-zizi','2026-07-07'),PHM('emp-zizi','2026-07-08'),PHM('emp-zizi','2026-07-09'),PHM('emp-zizi','2026-07-10'),PHM('emp-zizi','2026-07-11'),PHM('emp-zizi','2026-07-12'),
  KDM_F('emp-dela','2026-07-06'),KDM_F('emp-dela','2026-07-07'),OFF('emp-dela','2026-07-08'),KDM_F('emp-dela','2026-07-09'),KDM_F('emp-dela','2026-07-10'),PHM('emp-dela','2026-07-11'),KDM_F('emp-dela','2026-07-12'),
  OFF('emp-dila','2026-07-06'),KDM_F('emp-dila','2026-07-07'),KDM_F('emp-dila','2026-07-08'),KDM_F('emp-dila','2026-07-09'),KDM_F('emp-dila','2026-07-10'),KDM_F('emp-dila','2026-07-11'),KDM_F('emp-dila','2026-07-12'),
  PHM('emp-gaby','2026-07-06'),PHM('emp-gaby','2026-07-07'),PHM('emp-gaby','2026-07-08'),PHM('emp-gaby','2026-07-09'),OFF('emp-gaby','2026-07-10'),KDM_F('emp-gaby','2026-07-11'),PHM('emp-gaby','2026-07-12'),
  PHM('emp-teta','2026-07-06'),PHM('emp-teta','2026-07-07'),PHM('emp-teta','2026-07-08'),PHM('emp-teta','2026-07-09'),PHM('emp-teta','2026-07-10'),PHM('emp-teta','2026-07-11'),OFF('emp-teta','2026-07-12'),
  KDM_A('emp-shofi','2026-07-06'),KDM_A('emp-shofi','2026-07-07'),KDM_A('emp-shofi','2026-07-08'),OFF('emp-shofi','2026-07-09'),KDM_A('emp-shofi','2026-07-10'),KDM_A('emp-shofi','2026-07-11'),KDM_A('emp-shofi','2026-07-12'),
  PHM('emp-zahra','2026-07-13'),OFF('emp-zahra','2026-07-14'),PHM('emp-zahra','2026-07-15'),PHM('emp-zahra','2026-07-16'),PHM('emp-zahra','2026-07-17'),PHM('emp-zahra','2026-07-18'),PHM('emp-zahra','2026-07-19'),
  KDM_A('emp-akbar','2026-07-13'),KDM_A('emp-akbar','2026-07-14'),KDM_A('emp-akbar','2026-07-15'),OFF('emp-akbar','2026-07-16'),KDM_A('emp-akbar','2026-07-17'),KDM_A('emp-akbar','2026-07-18'),KDM_A('emp-akbar','2026-07-19'),
  OFF('emp-vero','2026-07-13'),KDM_F('emp-vero','2026-07-14'),KDM_F('emp-vero','2026-07-15'),KDM_F('emp-vero','2026-07-16'),KDM_F('emp-vero','2026-07-17'),KDM_F('emp-vero','2026-07-18'),KDM_F('emp-vero','2026-07-19'),
  PHM('emp-zizi','2026-07-13'),OFF('emp-zizi','2026-07-14'),PHM('emp-zizi','2026-07-15'),PHM('emp-zizi','2026-07-16'),PHM('emp-zizi','2026-07-17'),PHM('emp-zizi','2026-07-18'),PHM('emp-zizi','2026-07-19'),
  KDM_F('emp-dela','2026-07-13'),KDM_F('emp-dela','2026-07-14'),KDM_F('emp-dela','2026-07-15'),OFF('emp-dela','2026-07-16'),KDM_F('emp-dela','2026-07-17'),KDM_F('emp-dela','2026-07-18'),KDM_F('emp-dela','2026-07-19'),
  KDM_F('emp-dila','2026-07-13'),KDM_F('emp-dila','2026-07-14'),KDM_F('emp-dila','2026-07-15'),KDM_F('emp-dila','2026-07-16'),OFF('emp-dila','2026-07-17'),KDM_F('emp-dila','2026-07-18'),KDM_F('emp-dila','2026-07-19'),
  PHM('emp-gaby','2026-07-13'),PHM('emp-gaby','2026-07-14'),OFF('emp-gaby','2026-07-15'),PHM('emp-gaby','2026-07-16'),PHM('emp-gaby','2026-07-17'),PHM('emp-gaby','2026-07-18'),PHM('emp-gaby','2026-07-19'),
  PHM('emp-teta','2026-07-13'),PHM('emp-teta','2026-07-14'),OFF('emp-teta','2026-07-15'),PHM('emp-teta','2026-07-16'),PHM('emp-teta','2026-07-17'),PHM('emp-teta','2026-07-18'),PHM('emp-teta','2026-07-19'),
  KDM_A('emp-shofi','2026-07-13'),KDM_A('emp-shofi','2026-07-14'),KDM_A('emp-shofi','2026-07-15'),KDM_A('emp-shofi','2026-07-16'),OFF('emp-shofi','2026-07-17'),KDM_A('emp-shofi','2026-07-18'),KDM_A('emp-shofi','2026-07-19'),
].filter(() => TEST_RUNTIME)

const INITIAL_SCHEDULE_PUBLICATIONS: WeeklySchedulePublication[] = []

/**
 * @description Shared HR store for employees and attendance.
 */
export const useHrStore = create<HrStoreState>((set, get) => ({
  employees: INITIAL_EMPLOYEES,
  attendance: [],
  employeeDefaultSchedules: [],
  scheduleOverrides: INITIAL_SCHEDULE_OVERRIDES,
  weeklySchedulePublications: INITIAL_SCHEDULE_PUBLICATIONS,
  scheduleRevisions: [],
  attendanceReviewCases: [],
  employeePointEntries: [],
  pointRules: DEFAULT_ORDER_CONTRIBUTION_RULES,

  addEmployee: ({ name, systemRole, phone, hireDate, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.create_employee')) return employeeCommandError('forbidden', 'This role cannot create employees.')
    let result: HrEmployeeCommandResult = employeeCommandError('unknown', 'Employee profile could not be created.')
    set((state) => {
      if (!['owner', 'hr'].includes(actor.role)) { result = employeeCommandError('forbidden', 'Only Owner or HR can create employee profiles.'); return state }
      const settings = useSettingsStore.getState()
      if (systemRole === 'owner' || (actor.role === 'hr' && !isHrManagedEmployeeRole(systemRole, 'employees', settings.staffRoles.hrManagedRoles))) { result = employeeCommandError('forbidden', HR_PROTECTED_ROLE_MESSAGE, 'systemRole'); return state }
      if (!settings.staffRoles.roles.includes(systemRole)) { result = employeeCommandError('disabled_role', 'The selected role is disabled in Owner Settings.', 'systemRole'); return state }
      const cleanName = name.trim(); const cleanPhone = phone.trim()
      if (!cleanName) { result = employeeCommandError('invalid_name', 'Employee name is required.', 'name'); return state }
      if (cleanPhone && !/^\+?[0-9][0-9 ()-]{7,19}$/.test(cleanPhone)) { result = employeeCommandError('invalid_phone', 'Enter a valid WhatsApp number.', 'phone'); return state }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) { result = employeeCommandError('invalid_hire_date', 'Hire date is required.', 'hireDate'); return state }
      if (hireDate > todayIsoDate()) { result = employeeCommandError('future_hire_date', 'Hire date cannot be in the future.', 'hireDate'); return state }
      const employee: Employee = { id: `emp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, position: getEmployeeRoleLabel(systemRole), branch: '' as BranchId, systemRole, status: 'active', phone: cleanPhone, hireDate }
      result = { ok: true, employeeId: employee.id }
      return { employees: [employee, ...state.employees] }
    })
    return result
  },

  createStaffAccount: ({ employeeId, name, systemRole, phone, hireDate, email, username, pin, productionAuth = false, baseSalaryIdr, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.create_employee')) return employeeCommandError('forbidden', 'This role cannot create employees.')
    let result: HrEmployeeCommandResult = employeeCommandError('unknown', 'Account could not be created.')
    set((state) => {
      const eligibility = canCreateStaffAccount({ employees: state.employees, username, pin, email, systemRole, actor, hrManagedRoles: useSettingsStore.getState().staffRoles.hrManagedRoles, usesProductionPassword: productionAuth })
      if (!eligibility.ok) { const lower = eligibility.reason.toLowerCase(); const field = lower.includes('email') ? 'email' : lower.includes('username') ? 'username' : (lower.includes('pin') || lower.includes('password')) ? 'pin' : undefined; result = employeeCommandError(lower.includes('email') ? (lower.includes('already') ? 'duplicate_email' : 'invalid_email') : lower.includes('username') ? 'invalid_username' : (lower.includes('pin') || lower.includes('password')) ? 'invalid_pin' : 'forbidden', eligibility.reason, field); return state }
      const settings = useSettingsStore.getState()
      if (!settings.staffRoles.roles.includes(systemRole)) { result = employeeCommandError('disabled_role', 'The selected role is disabled in Owner Settings.', 'systemRole'); return state }
      const cleanName = name.trim(); const cleanPhone = phone.trim()
      if (!cleanName) { result = employeeCommandError('invalid_name', 'Employee name is required.', 'name'); return state }
      if (cleanPhone && !/^\+?[0-9][0-9 ()-]{7,19}$/.test(cleanPhone)) { result = employeeCommandError('invalid_phone', 'Enter a valid WhatsApp number.', 'phone'); return state }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) { result = employeeCommandError('invalid_hire_date', 'Hire date is required.', 'hireDate'); return state }
      if (hireDate > todayIsoDate()) { result = employeeCommandError('future_hire_date', 'Hire date cannot be in the future.', 'hireDate'); return state }
      const configuredRoleSalary = systemRole === 'owner' ? 0 : (settings.payroll.baseSalaryByRole?.[systemRole] ?? 0)
      const resolvedBaseSalaryIdr = baseSalaryIdr ?? (configuredRoleSalary > 0 ? configuredRoleSalary : undefined)
      if (resolvedBaseSalaryIdr !== undefined && (!Number.isInteger(resolvedBaseSalaryIdr) || resolvedBaseSalaryIdr <= 0)) { result = employeeCommandError('unknown', 'Base salary must be a positive whole rupiah amount.', 'baseSalaryIdr'); return state }
      const normalized = username ? normalizeUsername(username) : undefined
      if (normalized && state.employees.some((item) => item.username === normalized)) { result = employeeCommandError('duplicate_username', 'Username is already in use.', 'username'); return state }
      const normalizedEmail = email?.trim().toLowerCase()
      const employee: Employee = { id: employeeId ?? `emp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: cleanName, position: getEmployeeRoleLabel(systemRole), branch: '' as BranchId, systemRole, status: 'active', phone: cleanPhone, hireDate, email: normalizedEmail, username: normalized, pin: productionAuth ? undefined : pin, baseSalaryIdr:resolvedBaseSalaryIdr }
      result = { ok: true, employeeId: employee.id }
      return { employees: [employee, ...state.employees] }
    })
    return result
  },

  updateEmployeeRole: (employeeId, nextRole, actor) => {
    if (!isActionAuthorized(actor.role, 'hr.edit_employee')) return employeeCommandError('forbidden', 'This role cannot edit employees.')
    let result: HrEmployeeCommandResult = employeeCommandError('unknown', 'Role could not be updated.')
    set((state) => {
      const eligibility = canChangeEmployeeRole({ employees: state.employees, employeeId, nextRole, actor })
      if (!eligibility.ok) { result = employeeCommandError(eligibility.reason.includes('last active owner') ? 'last_owner' : 'forbidden', eligibility.reason, 'systemRole'); return state }
      if (!useSettingsStore.getState().staffRoles.roles.includes(nextRole)) { result = employeeCommandError('disabled_role', 'The selected role is disabled in Owner Settings.', 'systemRole'); return state }
      result = { ok: true, employeeId }
      return { employees: state.employees.map((employee) => employee.id === employeeId ? { ...employee, systemRole: nextRole, position: getEmployeeRoleLabel(nextRole) } : employee) }
    })
    return result
  },


  updateEmployeeBaseSalary: (employeeId, baseSalaryIdr, actor) => {
    if (actor.role !== 'owner') return employeeCommandError('forbidden', 'Only Owner can edit employee base salary.')
    if (!Number.isInteger(baseSalaryIdr) || baseSalaryIdr <= 0) return employeeCommandError('unknown', 'Base salary must be a positive whole rupiah amount.', 'baseSalaryIdr')
    let found = false
    set((state) => ({ employees: state.employees.map((employee) => {
      if (employee.id !== employeeId) return employee
      found = true
      return { ...employee, baseSalaryIdr }
    }) }))
    return found ? { ok:true, employeeId } : employeeCommandError('not_found', 'Employee was not found.')
  },


  updateEmployeeProfile: ({ employeeId, name, phone, hireDate, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.edit_employee')) return employeeCommandError('forbidden', 'This role cannot edit employees.')
    let result: HrEmployeeCommandResult = employeeCommandError('unknown', 'Employee profile could not be updated.')
    set((state) => {
      const employee = state.employees.find((item) => item.id === employeeId)
      if (!employee) { result = employeeCommandError('not_found', 'Employee record was not found.'); return state }
      if (!['owner', 'hr'].includes(actor.role)) { result = employeeCommandError('forbidden', 'Only Owner or HR can edit employee profiles.'); return state }
      if (!canActorManageEmployee(actor.role, employee.systemRole, 'employees', useSettingsStore.getState().staffRoles.hrManagedRoles)) { result = employeeCommandError('forbidden', HR_PROTECTED_ROLE_MESSAGE); return state }
      const cleanName = name.trim(); const cleanPhone = phone.trim()
      if (!cleanName) { result = employeeCommandError('invalid_name', 'Employee name is required.', 'name'); return state }
      if (cleanPhone && !/^\+?[0-9][0-9 ()-]{7,19}$/.test(cleanPhone)) { result = employeeCommandError('invalid_phone', 'Enter a valid WhatsApp number.', 'phone'); return state }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) { result = employeeCommandError('invalid_hire_date', 'Hire date is required.', 'hireDate'); return state }
      if (hireDate > todayIsoDate()) { result = employeeCommandError('future_hire_date', 'Hire date cannot be in the future.', 'hireDate'); return state }
      result = { ok: true, employeeId }
      return { employees: state.employees.map((item) => item.id === employeeId ? { ...item, name: cleanName, phone: cleanPhone, hireDate } : item) }
    })
    return result
  },

  updateEmployeeAccess: ({ employeeId, systemRole, email, username, pin, productionAuth = false, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.edit_employee')) return employeeCommandError('forbidden', 'This role cannot edit employees.')
    let result: HrEmployeeCommandResult = employeeCommandError('unknown', 'Employee access could not be updated.')
    set((state) => {
      const employee = state.employees.find((item) => item.id === employeeId)
      if (!employee) { result = employeeCommandError('not_found', 'Employee record was not found.'); return state }
      if (!['owner', 'hr'].includes(actor.role)) { result = employeeCommandError('forbidden', 'Only Owner or HR can change employee assignment.'); return state }
      if (!canActorManageEmployee(actor.role, employee.systemRole, 'employees', useSettingsStore.getState().staffRoles.hrManagedRoles) || (actor.role === 'hr' && !isHrManagedEmployeeRole(systemRole, 'employees', useSettingsStore.getState().staffRoles.hrManagedRoles)) || systemRole === 'owner') { result = employeeCommandError('forbidden', HR_PROTECTED_ROLE_MESSAGE, 'systemRole'); return state }
      const settings = useSettingsStore.getState()
      if (!settings.staffRoles.roles.includes(systemRole)) { result = employeeCommandError('disabled_role', 'The selected role is disabled in Owner Settings.', 'systemRole'); return state }
      if (actor.role !== 'owner' && systemRole !== employee.systemRole) { result = employeeCommandError('forbidden', 'Only Owner can edit employee roles.', 'systemRole'); return state }
      if (systemRole !== employee.systemRole) { const roleResult = canChangeEmployeeRole({ employees: state.employees, employeeId, nextRole: systemRole, actor }); if (!roleResult.ok) { result = employeeCommandError(roleResult.reason.includes('last active owner') ? 'last_owner' : 'forbidden', roleResult.reason, 'systemRole'); return state } }
      const nextUsername = normalizeUsername(username ?? employee.username ?? '')
      const nextEmail = email?.trim().toLowerCase()
      if (actor.role === 'owner') {
        if (nextEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) { result = employeeCommandError('invalid_email', 'Enter a valid recovery email address.', 'email'); return state }
        if (nextEmail && state.employees.some((item) => item.id !== employeeId && item.email?.trim().toLowerCase() === nextEmail)) { result = employeeCommandError('duplicate_email', 'Email is already in use.', 'email'); return state }
        if (!nextUsername || !/^[a-z][a-z0-9._-]*$/.test(nextUsername)) { result = employeeCommandError('invalid_username', 'Username must be lowercase and start with a letter.', 'username'); return state }
        if (state.employees.some((item) => item.id !== employeeId && item.username === nextUsername)) { result = employeeCommandError('duplicate_username', 'Username is already in use.', 'username'); return state }
        if (pin && !isStrongStaffPassword(pin)) { result = employeeCommandError('invalid_pin', STAFF_PASSWORD_HELP, 'pin'); return state }
      }
      result = { ok: true, employeeId }
      return { employees: state.employees.map((item) => item.id === employeeId ? { ...item, systemRole, position: getEmployeeRoleLabel(systemRole), email: actor.role === 'owner' && nextEmail !== undefined ? nextEmail : item.email, username: actor.role === 'owner' ? nextUsername : item.username, pin: actor.role === 'owner' && pin && !productionAuth ? pin : item.pin } : item) }
    })
    return result
  },

  activateEmployee: (employeeId, actor) => {
    if (!isActionAuthorized(actor.role, 'hr.edit_employee')) return false
    let changed = false
    set((state) => {
      if (!canSetEmployeeActiveState({ employees: state.employees, employeeId, active: true, actor }).ok) return state
      changed = true
      return { employees: state.employees.map((employee) => employee.id === employeeId ? { ...employee, status: 'active' as const } : employee) }
    })
    return changed
  },

  deactivateEmployee: (employeeId, actor) => {
    if (!isActionAuthorized(actor.role, 'hr.edit_employee')) return false
    let changed = false
    set((state) => {
      if (!canSetEmployeeActiveState({ employees: state.employees, employeeId, active: false, actor }).ok) return state
      changed = true
      const today = todayIsoDate()
      const removedDates = state.scheduleOverrides.filter((item)=>item.employeeId===employeeId && item.date>today).map((item)=>item.date)
      return {
        employees: state.employees.map((employee) => employee.id === employeeId ? { ...employee, status: 'inactive' as const } : employee),
        scheduleOverrides: state.scheduleOverrides.filter((item)=>item.employeeId!==employeeId || item.date<=today),
        weeklySchedulePublications: state.weeklySchedulePublications.map((publication)=>{
          const end = new Date(`${publication.weekStart}T00:00:00Z`)
          end.setUTCDate(end.getUTCDate()+6)
          const affected = removedDates.some((date)=>date>=publication.weekStart && date<=end.toISOString().slice(0,10))
          return affected ? { ...publication, status:'changed_after_publish' as const, updatedAt:nowIso() } : publication
        }),
      }
    })
    return changed
  },

  removeUnusedEmployee: ({ employeeId, reason, actor }) => {
    if (!['owner','hr'].includes(actor.role) || !isActionAuthorized(actor.role, 'hr.edit_employee')) return { ok:false, code:'forbidden', reason:'Only Owner or HR can permanently remove an employee within their role authority.' }
    if (reason.trim().length < 3) return { ok:false, code:'reason_required', reason:'Add a removal reason.' }
    let result:HrEmployeeRemovalResult = { ok:false, code:'not_found', reason:'Employee was not found.' }
    set((state)=>{
      const employee=state.employees.find((item)=>item.id===employeeId)
      if (!employee) return state
      if (employee.systemRole==='owner') { result={ok:false,code:'forbidden',reason:'Owner accounts cannot be removed.'}; return state }
      if (actor.role==='hr' && !['admin','florist'].includes(employee.systemRole)) { result={ok:false,code:'forbidden',reason:'HR can permanently remove unused Admin or Florist accounts only.'}; return state }
      const blockers=getEmployeeRemovalBlockers({
        employeeId,
        attendance:state.attendance,
        attendanceReviews:state.attendanceReviewCases,
        points:state.employeePointEntries,
        scheduleOverrides:state.scheduleOverrides,
        scheduleRevisions:state.scheduleRevisions,
        schedulePublications:state.weeklySchedulePublications,
        orders:[],
        payrollDrafts:[],
        compensations:[],
        today:todayIsoDate(),
      })
      if (blockers.length) { result={ok:false,code:'history_exists',reason:'This employee has operational history and cannot be permanently removed. Deactivate the employee instead.'}; return state }
      result={ok:true,employeeId}
      return {
        employees:state.employees.filter((item)=>item.id!==employeeId),
        employeeDefaultSchedules:state.employeeDefaultSchedules.filter((item)=>item.employeeId!==employeeId),
        scheduleOverrides:state.scheduleOverrides.filter((item)=>item.employeeId!==employeeId),
      }
    })
    return result
  },

  saveEmployeeDefaultSchedule: () => ({
    ok: false,
    code: 'unsupported',
    reason: 'Employee-level default branch schedules are disabled. Assign a branch on each dated schedule.',
  }),

  clearEmployeeDefaultSchedule: ({ employeeId, actor }) => {
    const settings = useSettingsStore.getState()
    if (!canEditScheduling(actor.role, settings.permissions)) return { ok:false, code:'forbidden', reason:'You do not have permission to edit schedules.' }
    let affected = 0
    set((state) => {
      affected = state.employeeDefaultSchedules.some((item) => item.employeeId === employeeId) ? 1 : 0
      return { employeeDefaultSchedules: state.employeeDefaultSchedules.filter((item) => item.employeeId !== employeeId) }
    })
    return { ok:true, affected }
  },

  setScheduleOverride: ({ employeeId, date, shift, note, workMode, actor }) => {
    let result: HrScheduleCommandResult = { ok:false, code:'not_found', reason:'Employee was not found.' }
    set((state) => {
      const settings = useSettingsStore.getState()
      if (!canEditScheduling(actor.role, settings.permissions)) { result = { ok:false, code:'forbidden', reason:'You do not have permission to edit schedules.' }; return state }
      const employee = state.employees.find((item) => item.id === employeeId)
      if (!employee) return state
      if (!canActorManageEmployee(actor.role, employee.systemRole, 'scheduling', settings.staffRoles.hrManagedRoles)) { result = { ok:false, code:'forbidden', reason:HR_PROTECTED_ROLE_MESSAGE }; return state }
      if (employee.status !== 'active') { result = { ok:false, code:'inactive_employee', reason:'Inactive employees cannot receive a schedule.' }; return state }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { result = { ok:false, code:'invalid_date', reason:'Select a valid schedule date.' }; return state }
      const branch = settings.branches.find((item) => item.id === shift.branchId)
      const error = validateEmployeeScheduleShift(employee, shift, branch, date)
      if (error) { result = { ok:false, code:error.includes('branch') || error.includes('closed') ? 'invalid_branch' : 'invalid_shift', reason:error }; return state }
      const storedShift = materializeScheduleShift(shift, branch, getWeekdayKey(date))
      const previous = state.scheduleOverrides.find((item) => item.employeeId === employeeId && item.date === date)
      const changedAt = nowIso()
      const next: ScheduleOverride = { id:`schedule-${employeeId}-${date}`, employeeId, date, shift:storedShift, note:note?.trim() || undefined, workMode:workMode === 'wfh' ? 'wfh' : 'onsite', updatedAt:changedAt, updatedBy:actor.name }
      const publishedWeek = state.weeklySchedulePublications.find((item)=>item.weekStart<=date && date<=getLocalDateString(new Date(new Date(`${item.weekStart}T00:00:00`).getTime()+6*86400000)))
      if (publishedWeek && !note?.trim()) { result={ok:false,code:'invalid_shift',reason:'Add a reason before changing a published schedule.'}; return state }
      const revision:ScheduleRevision|undefined = publishedWeek ? { id:`schedule-revision-${employeeId}-${date}-${Date.now()}`,employeeId,date,previousShift:previous?.shift,nextShift:next.shift,previousNote:previous?.note,nextNote:next.note,previousWorkMode:previous?.workMode,nextWorkMode:next.workMode,changedBy:actor.name,changedAt,reason:note!.trim() } : undefined
      result = { ok:true, affected:1 }
      return { scheduleOverrides: [...state.scheduleOverrides.filter((item) => !(item.employeeId === employeeId && item.date === date)), next], weeklySchedulePublications: state.weeklySchedulePublications.map((item)=>item.weekStart<=date && date<=getLocalDateString(new Date(new Date(`${item.weekStart}T00:00:00`).getTime()+6*86400000)) ? {...item,status:'changed_after_publish',updatedAt:changedAt} : item), scheduleRevisions: revision ? [revision,...state.scheduleRevisions] : state.scheduleRevisions }
    })
    return result
  },

  clearScheduleOverride: ({ employeeId, date, actor }) => {
    const settings = useSettingsStore.getState()
    if (!canEditScheduling(actor.role, settings.permissions)) return { ok:false, code:'forbidden', reason:'You do not have permission to edit schedules.' }
    let affected = 0
    set((state) => {
      affected = state.scheduleOverrides.some((item) => item.employeeId === employeeId && item.date === date) ? 1 : 0
      return { scheduleOverrides: state.scheduleOverrides.filter((item) => !(item.employeeId === employeeId && item.date === date)) }
    })
    return { ok:true, affected }
  },

  bulkSetScheduleOverrides: ({ employeeIds, dates, shift, note, workMode, actor }) => {
    if (employeeIds.length === 0 || dates.length === 0) return { ok:false, code:'empty_selection', reason:'Select at least one employee and one day.' }
    let result: HrScheduleCommandResult = { ok:false, code:'empty_selection', reason:'Nothing was scheduled.' }
    set((state) => {
      const settings = useSettingsStore.getState()
      if (!canEditScheduling(actor.role, settings.permissions)) { result = { ok:false, code:'forbidden', reason:'You do not have permission to edit schedules.' }; return state }
      const selectedEmployees = state.employees.filter((item) => employeeIds.includes(item.id) && canActorManageEmployee(actor.role, item.systemRole, 'scheduling', useSettingsStore.getState().staffRoles.hrManagedRoles))
      if (selectedEmployees.length !== employeeIds.length) { result = { ok:false, code:'not_found', reason:'One or more employees no longer exist.' }; return state }
      if (selectedEmployees.some((item) => item.status !== 'active')) { result = { ok:false, code:'inactive_employee', reason:'Remove inactive employees from the bulk selection.' }; return state }
      for (const date of dates) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { result = { ok:false, code:'invalid_date', reason:'One or more selected dates are invalid.' }; return state }
        const branch = settings.branches.find((item) => item.id === shift.branchId)
        for (const employee of selectedEmployees) {
          const error = validateEmployeeScheduleShift(employee, shift, branch, date)
          if (error) { result = { ok:false, code:error.includes('branch') || error.includes('closed') ? 'invalid_branch' : 'invalid_shift', reason:`${date}: ${error}` }; return state }
        }
      }
      const keys = new Set(employeeIds.flatMap((employeeId) => dates.map((date) => `${employeeId}|${date}`)))
      const retained = state.scheduleOverrides.filter((item) => !keys.has(`${item.employeeId}|${item.date}`))
      const created = employeeIds.flatMap((employeeId) => dates.map((date): ScheduleOverride => {
        const branch = settings.branches.find((item) => item.id === shift.branchId)
        return { id:`schedule-${employeeId}-${date}`, employeeId, date, shift:materializeScheduleShift({...shift}, branch, getWeekdayKey(date)), note:note?.trim() || undefined, workMode:workMode === 'wfh' ? 'wfh' : 'onsite', updatedAt:nowIso(), updatedBy:actor.name }
      }))
      result = { ok:true, affected:created.length }
      return { scheduleOverrides: [...retained, ...created], weeklySchedulePublications: state.weeklySchedulePublications.map((item)=>dates.some((date)=>item.weekStart<=date && date<=getLocalDateString(new Date(new Date(`${item.weekStart}T00:00:00`).getTime()+6*86400000))) ? {...item,status:'changed_after_publish',updatedAt:nowIso()} : item) }
    })
    return result
  },

  generateWeekFromDefaults: ({ weekStart, branchId, actor }) => {
    let result: HrScheduleCommandResult = { ok:false, code:'empty_selection', reason:'No active staff was available.' }
    set((state) => {
      const settings = useSettingsStore.getState()
      if (!canEditScheduling(actor.role, settings.permissions)) { result={ok:false,code:'forbidden',reason:'You do not have permission to generate schedules.'}; return state }
      const dates = Array.from({length:7},(_,index)=>{ const date=new Date(`${weekStart}T00:00:00`); date.setDate(date.getDate()+index); return getLocalDateString(date) })
      const activeBranches = settings.branches.filter((branch)=>branch.isActive && (branchId==='All' || branch.id===branchId)).sort((a,b)=>a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      if (!activeBranches.length) { result={ok:false,code:'invalid_branch',reason:'No active branch is available for this schedule.'}; return state }
      const roster = state.employees.filter((employee)=>
        (employee.systemRole==='admin' || employee.systemRole==='florist')
        && isEmployeeOperationallyReady({
          employee,
          roleSalaryIdr:settings.payroll.baseSalaryByRole?.[employee.systemRole] ?? 0,
          productionAuth:isSupabaseConfigured() || isSharedBackendConfigured(),
        }),
      ).sort((a,b)=>a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      const operational = roster
      if (!operational.length) return state
      const weekKeys = new Set(roster.flatMap((employee)=>dates.map((date)=>`${employee.id}|${date}`)))
      const retained = state.scheduleOverrides.filter((item)=>!weekKeys.has(`${item.employeeId}|${item.date}`))
      const created: ScheduleOverride[] = []
      const branchShift = (assignmentBranchId:string,date:string):ScheduleShift => materializeScheduleShift(
        { mode:'follow_branch_hours', isWorking:true, branchId:assignmentBranchId, startTime:'00:00', endTime:'00:00' },
        activeBranches.find((branch)=>branch.id===assignmentBranchId),
        getWeekdayKey(date),
      )
      for (const roleName of ['admin','florist'] as const) {
        const people = operational.filter((employee)=>employee.systemRole===roleName)
        const minimum = settings.scheduling.minimumCoverage?.[roleName] ?? (roleName==='admin'?1:2)
        const branchSlots = activeBranches.flatMap((branch)=>Array.from({length:minimum},()=>branch.id))
        const offDayByEmployee = new Map(people.map((employee,index)=>[employee.id,(index+(roleName==='florist'?1:0))%7]))
        dates.forEach((date,dayIndex)=>{
          const workingToday=people.filter((employee)=>offDayByEmployee.get(employee.id)!==dayIndex)
          workingToday.forEach((employee,index)=>{
            const assignedBranch = branchSlots[index % Math.max(1,branchSlots.length)] ?? activeBranches[index % activeBranches.length].id
            created.push({id:`schedule-${employee.id}-${date}`,employeeId:employee.id,date,shift:branchShift(assignedBranch,date),note:'Generated deterministic schedule',updatedAt:nowIso(),updatedBy:actor.name})
          })
          people.filter((employee)=>offDayByEmployee.get(employee.id)===dayIndex).forEach((employee)=>{
            created.push({id:`schedule-${employee.id}-${date}`,employeeId:employee.id,date,shift:{mode:'off',isWorking:false,branchId:'',startTime:'00:00',endTime:'00:00'},note:'Weekly rest',updatedAt:nowIso(),updatedBy:actor.name})
          })
        })
      }
      result={ok:true,affected:created.length}
      return {scheduleOverrides:[...retained,...created],weeklySchedulePublications:state.weeklySchedulePublications.filter((item)=>!(item.weekStart===weekStart && item.branchId===branchId))}
    })
    return result
  },

  copyPreviousScheduleWeek: ({ weekStart, branchId, actor }) => {
    let result: HrScheduleCommandResult = { ok:false, code:'empty_selection', reason:'No previous-week schedule was available to copy.' }
    set((state) => {
      const settings = useSettingsStore.getState()
      if (!canEditScheduling(actor.role, settings.permissions)) { result={ok:false,code:'forbidden',reason:'You do not have permission to copy schedules.'}; return state }
      const targetDates=Array.from({length:7},(_,index)=>{ const date=new Date(`${weekStart}T00:00:00`); date.setDate(date.getDate()+index); return getLocalDateString(date) })
      const sourceDates=targetDates.map((value)=>{ const date=new Date(`${value}T00:00:00`); date.setDate(date.getDate()-7); return getLocalDateString(date) })
      const employees=state.employees.filter((employee)=>employee.status==='active' && (employee.systemRole==='admin'||employee.systemRole==='florist'))
      if(!employees.length) return state
      const keys=new Set(employees.flatMap((employee)=>targetDates.map((date)=>`${employee.id}|${date}`)))
      const retained=state.scheduleOverrides.filter((item)=>!keys.has(`${item.employeeId}|${item.date}`))
      const created=employees.flatMap((employee)=>targetDates.map((date,index):ScheduleOverride=>{
        const source=getEffectiveScheduleForDate({employee,date:sourceDates[index],defaults:state.employeeDefaultSchedules,overrides:state.scheduleOverrides,settings:{scheduling:settings.getSchedulingSettingsForDate(sourceDates[index]),branches:settings.branches}})
        return {id:`schedule-${employee.id}-${date}`,employeeId:employee.id,date,shift:{...source.shift},note:'Copied from previous week',updatedAt:nowIso(),updatedBy:actor.name}
      }))
      result={ok:true,affected:created.length}
      return {scheduleOverrides:[...retained,...created],weeklySchedulePublications:state.weeklySchedulePublications.filter((item)=>!(item.weekStart===weekStart&&item.branchId===branchId))}
    })
    return result
  },

  resetScheduleWeekToDefaults: ({ weekStart, branchId, actor }) => {
    return get().generateWeekFromDefaults({ weekStart, branchId, actor })
  },

  publishScheduleWeek: ({ weekStart, branchId, actor, allowCoverageShortage=false, coverageShortageReason }) => {
    let result: HrScheduleCommandResult = { ok:false, code:'empty_selection', reason:'No schedule was available to publish.' }
    set((state)=>{
      const settings=useSettingsStore.getState()
      if (!canEditScheduling(actor.role,settings.permissions)) { result={ok:false,code:'forbidden',reason:'You do not have permission to publish schedules.'}; return state }
      const dates=Array.from({length:7},(_,index)=>{ const date=new Date(`${weekStart}T00:00:00`); date.setDate(date.getDate()+index); return getLocalDateString(date) })
      const employees=state.employees.filter((employee)=>employee.status==='active' && (employee.systemRole==='admin'||employee.systemRole==='florist'))
      if (!employees.length) return state
      for (const employee of employees) {
        const employeeWeek = dates.map((date)=>state.scheduleOverrides.find((item)=>item.employeeId===employee.id && item.date===date))
        const missingIndex = employeeWeek.findIndex((item)=>!item)
        if (missingIndex >= 0) { result={ok:false,code:'incomplete_schedule',reason:`${employee.name} is not assigned on ${dates[missingIndex]}. Choose a branch or OFF before publishing.`}; return state }
        const offCount = employeeWeek.filter((item)=>item && !item.shift.isWorking).length
        const workCount = employeeWeek.filter((item)=>item?.shift.isWorking).length
        if (offCount !== 1) { result={ok:false,code:'invalid_weekly_rest',reason:`${employee.name} must have exactly one OFF day this week.`}; return state }
        if (workCount > 6) { result={ok:false,code:'too_many_workdays',reason:`${employee.name} cannot work more than 6 days this week.`}; return state }
        for (const item of employeeWeek) {
          if (!item) continue
          const branch=settings.branches.find((branch)=>branch.id===item.shift.branchId)
          const error=validateEmployeeScheduleShift(employee,item.shift,branch,item.date)
          if(error){result={ok:false,code:'invalid_shift',reason:`${employee.name} · ${item.date}: ${error}`};return state}
        }
      }
      const selectedBranches = branchId==='All' ? settings.branches.filter((item)=>item.isActive) : settings.branches.filter((item)=>item.id===branchId && item.isActive)
      const minimum=settings.scheduling.minimumCoverage ?? {admin:1,florist:2}
      const shortages:string[]=[]
      for (const date of dates) for (const branch of selectedBranches) {
        let admins=0, florists=0
        for (const employee of employees) {
          const item=state.scheduleOverrides.find((entry)=>entry.employeeId===employee.id && entry.date===date)
          if (!item?.shift.isWorking || item.shift.branchId!==branch.id) continue
          if (employee.systemRole==='admin') admins++
          if (employee.systemRole==='florist') florists++
        }
        if (admins<minimum.admin || florists<minimum.florist) shortages.push(`${date} ${branch.name}: Admin ${admins}/${minimum.admin}, Florist ${florists}/${minimum.florist}`)
      }
      if (shortages.length && !allowCoverageShortage) { result={ok:false,code:'coverage_warning',reason:`Coverage is below minimum on ${shortages.length} branch-day(s). Confirm to publish anyway.`}; return state }
      const shortageReason=coverageShortageReason?.trim()
      if (shortages.length && allowCoverageShortage && !shortageReason) { result={ok:false,code:'invalid_shift',reason:'Add a reason before publishing below minimum coverage.'}; return state }
      const now=nowIso(); const existing=state.weeklySchedulePublications.find((item)=>item.weekStart===weekStart&&item.branchId===branchId)
      const publication:WeeklySchedulePublication={id:existing?.id??`schedule-publication-${branchId}-${weekStart}`,weekStart,branchId,status:shortages.length?'published_with_shortage':'published',publishedAt:existing?.publishedAt??now,publishedBy:actor.name,updatedAt:now,shortageReason:shortageReason||undefined,shortageCount:shortages.length||undefined}
      result={ok:true,affected:employees.length}
      return {weeklySchedulePublications:[...state.weeklySchedulePublications.filter((item)=>item.id!==publication.id),publication]}
    })
    return result
  },

  recordAttendance: ({ employeeId, date, status, note, reviewCaseId, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.correct_attendance')) return false
    let changed = false
    set((state) => {
      if (!canRecordAttendance({ employee: state.employees.find((item) => item.id === employeeId), date, status, actor }).ok) return state
      const reason = note?.trim()
      if (!reason) return state
      const reviewCase = reviewCaseId
        ? (state.attendanceReviewCases ?? []).find((item) => item.id === reviewCaseId)
        : undefined
      if (reviewCaseId && (
        !reviewCase
        || !['pending', 'problem'].includes(reviewCase.status)
        || reviewCase.employeeId !== employeeId
        || reviewCase.date !== date
        || !isActionAuthorized(actor.role, 'hr.review_attendance')
      )) return state
      changed = true
      const existingIndex = state.attendance.findIndex(
        (record) => record.employeeId === employeeId && record.date === date,
      )

      const existingRecord = existingIndex >= 0 ? state.attendance[existingIndex] : undefined
      const changedAt = nowIso()
      const nextRecord: AttendanceRecord = existingRecord
        ? {
            ...existingRecord,
            status,
            corrections: [
              ...(existingRecord.corrections ?? []),
              {
                previousStatus: existingRecord.status,
                nextStatus: status,
                reason,
                correctedBy: actor.name,
                correctedAt: changedAt,
              },
            ],
          }
        : {
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            employeeId,
            date,
            status,
            note: reason,
            actor: actor.name,
            createdAt: changedAt,
            source: 'manual',
          }

      if (existingIndex >= 0) {
        const attendance = [...state.attendance]
        attendance[existingIndex] = nextRecord
        return {
          attendance,
          ...(reviewCaseId ? {
            attendanceReviewCases: (state.attendanceReviewCases ?? []).map((item) => item.id === reviewCaseId
              ? { ...item, status: 'corrected' as const, reviewNote: reason, reviewedBy: actor.name, reviewedAt: changedAt, proposedMinusPoints: undefined }
              : item),
          } : {}),
        }
      }

      return {
        attendance: [nextRecord, ...state.attendance],
        ...(reviewCaseId ? {
          attendanceReviewCases: (state.attendanceReviewCases ?? []).map((item) => item.id === reviewCaseId
            ? { ...item, status: 'corrected' as const, reviewNote: reason, reviewedBy: actor.name, reviewedAt: changedAt, proposedMinusPoints: undefined }
            : item),
        } : {}),
      }
    })
    return changed
  },

  recordSelfieAttendance: ({ employeeId, selfieDataUrl, actor, location }) => {
    let result: { ok: true } | { ok: false; reason: string } = { ok: false, reason: 'Attendance could not be recorded.' }
    set((state) => {
      const now = nowInJakarta()
      const date = getLocalDateString(now)
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const employee = state.employees.find((item) => item.id === employeeId)
      if (!location) { result = { ok:false, reason:'Location permission is required for attendance.' }; return state }
      const settingsState = useSettingsStore.getState()
      const settings = { ...settingsState, scheduling: settingsState.getSchedulingSettingsForDate(date) }
      const nearest = findNearestAttendanceBranch(location, settings.branches, settings.attendance.locationRadiusMeters)
      if (!nearest) { result = { ok:false, reason:'No active branch location is configured.' }; return state }
      result = canRecordSelfieAttendance({
        employee,
        date,
        today: todayIsoDate(),
        selfieDataUrl,
        actor,
        locationWithinRange: nearest.withinAnyBranchRange,
        alreadyRecorded: state.attendance.some((record) => record.employeeId === employeeId && record.date === date),
      })
      if (!result.ok || !employee) return state
      const effectiveSchedule = getEffectiveScheduleForDate({ employee, date, defaults: state.employeeDefaultSchedules, overrides: state.scheduleOverrides, settings })
      if (effectiveSchedule.source !== 'override' || !effectiveSchedule.shift.isWorking || !effectiveSchedule.shift.branchId) {
        result = { ok:false, reason:'A dated working schedule is required before check-in.' }
        return state
      }
      const scheduledBranch = settings.branches.find((item) => item.id === effectiveSchedule.shift.branchId && item.isActive)
      if (!scheduledBranch) {
        result = { ok:false, reason:'The scheduled branch is not active or has no attendance configuration.' }
        return state
      }
      const wrongBranch = scheduledBranch.id !== nearest.branch.id
      const outsideScheduledTime = effectiveSchedule.shift.isWorking && (currentTime < effectiveSchedule.shift.startTime || currentTime > effectiveSchedule.shift.endTime)
      const poorLocationAccuracy = (location.accuracyMeters ?? 0) > settings.attendance.locationRadiusMeters * 4
      const scheduleMismatch = !effectiveSchedule.shift.isWorking || wrongBranch || outsideScheduledTime || poorLocationAccuracy
      const branchMismatch = wrongBranch
      const warningReasons = [
        !effectiveSchedule.shift.isWorking ? 'Checked in on a scheduled day off.' : null,
        wrongBranch ? `Checked in at ${nearest.branch.name}; scheduled branch is ${scheduledBranch?.name}.` : null,
        outsideScheduledTime ? `Checked in at ${currentTime}; scheduled shift is ${effectiveSchedule.shift.startTime}–${effectiveSchedule.shift.endTime}.` : null,
        poorLocationAccuracy ? 'GPS could not be verified after repeated attempts; attendance requires HR review.' : null,
      ].filter(Boolean)
      const warningReason = warningReasons.join(' ') || undefined
      const nextRecord: AttendanceRecord = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        employeeId,
        date,
        status: 'present',
        actor: actor.name,
        createdAt: nowIso(),
        selfieDataUrl,
        checkInAt: nowIso(),
        source: 'selfie',
        checkInLocation: { ...location, branchLatitude: nearest.branch.location!.latitude, branchLongitude: nearest.branch.location!.longitude, distanceMeters: nearest.distanceMeters, withinRange: nearest.withinRange, acceptedRadiusMeters: settings.attendance.locationRadiusMeters, accuracyMeters: location.accuracyMeters ?? 0, detectedBranchId: nearest.branch.id, detectedBranchName: nearest.branch.name, branchMismatch, scheduleMismatch, scheduledBranchId: scheduledBranch?.id, scheduledBranchName: scheduledBranch?.name, scheduledStartTime: effectiveSchedule.shift.startTime, scheduledEndTime: effectiveSchedule.shift.endTime, reviewStatus: scheduleMismatch ? 'pending_review' : 'not_required', reviewReason: warningReason },
      }
      const warnings = buildAttendanceWarnings({ record:nextRecord, employee, defaults:state.employeeDefaultSchedules, overrides:state.scheduleOverrides, settings })
      const existingIds = new Set((state.attendanceReviewCases ?? []).map(item=>item.id))
      return { attendance: [nextRecord, ...state.attendance], attendanceReviewCases:[...warnings.filter(item=>!existingIds.has(item.id)), ...(state.attendanceReviewCases ?? [])] }
    })
    return result
  },

  recordSelfieCheckOut: ({ employeeId, selfieDataUrl, actor, location }) => {
    let result: { ok: true } | { ok: false; reason: string } = { ok: false, reason: 'Check-out could not be recorded.' }
    set((state) => {
      const now = nowInJakarta()
      const date = getLocalDateString(now)
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const employee = state.employees.find((item) => item.id === employeeId)
      const attendanceIndex = state.attendance.findIndex((record) => record.employeeId === employeeId && record.date === date)
      const attendanceRecord = attendanceIndex >= 0 ? state.attendance[attendanceIndex] : undefined
      if (!location) { result = { ok:false, reason:'Location permission is required for attendance.' }; return state }
      const settingsState = useSettingsStore.getState()
      const settings = { ...settingsState, scheduling: settingsState.getSchedulingSettingsForDate(date) }
      const effectiveSchedule = employee ? getEffectiveScheduleForDate({ employee, date, defaults: state.employeeDefaultSchedules, overrides: state.scheduleOverrides, settings }) : null
      if (!effectiveSchedule || effectiveSchedule.source !== 'override' || !effectiveSchedule.shift.isWorking || !effectiveSchedule.shift.branchId) {
        result = { ok:false, reason:'A dated working schedule is required before check-out.' }
        return state
      }
      const scheduledBranch = settings.branches.find((item) => item.id === effectiveSchedule.shift.branchId && item.isActive)
      if (!scheduledBranch) {
        result = { ok:false, reason:'The scheduled branch is not active or has no attendance configuration.' }
        return state
      }
      const scheduledEnd = effectiveSchedule.shift.endTime
      const nearest = findNearestAttendanceBranch(location, settings.branches, settings.attendance.locationRadiusMeters)
      if (!nearest) { result = { ok:false, reason:'No active branch location is configured.' }; return state }
      result = canRecordSelfieCheckOut({
        employee,
        date,
        today: getLocalDateString(now),
        currentTime,
        scheduledEndTime: scheduledEnd,
        checkoutWindowMinutes: settings.attendance.checkoutGraceMinutes,
        selfieDataUrl,
        actor,
        attendance: attendanceRecord,
        locationWithinRange: nearest.withinAnyBranchRange,
      })
      if (!result.ok || attendanceIndex < 0) return state
      const next = [...state.attendance]
      next[attendanceIndex] = {
        ...next[attendanceIndex],
        checkOutSelfieDataUrl: selfieDataUrl,
        checkOutAt: nowIso(),
        actor: actor.name,
        checkOutLocation: { ...location, branchLatitude: nearest.branch.location!.latitude, branchLongitude: nearest.branch.location!.longitude, distanceMeters: nearest.distanceMeters, withinRange: nearest.withinRange, acceptedRadiusMeters: settings.attendance.locationRadiusMeters, accuracyMeters: location.accuracyMeters ?? 0, detectedBranchId: nearest.branch.id, detectedBranchName: nearest.branch.name, scheduledBranchId: scheduledBranch.id, scheduledBranchName: scheduledBranch.name, scheduledStartTime: effectiveSchedule.shift.startTime, scheduledEndTime: effectiveSchedule.shift.endTime, scheduleMismatch: scheduledBranch.id !== nearest.branch.id || (location.accuracyMeters ?? 0) > settings.attendance.locationRadiusMeters * 4, branchMismatch: scheduledBranch.id !== nearest.branch.id, reviewStatus: scheduledBranch.id !== nearest.branch.id || (location.accuracyMeters ?? 0) > settings.attendance.locationRadiusMeters * 4 ? 'pending_review' : 'not_required', reviewReason: (location.accuracyMeters ?? 0) > settings.attendance.locationRadiusMeters * 4 ? 'GPS accuracy requires HR review.' : scheduledBranch.id !== nearest.branch.id ? `Checked out at ${nearest.branch.name}; scheduled branch is ${scheduledBranch.name}.` : undefined },
      }
      return { attendance: next }
    })
    return result
  },

  generateAttendanceWarnings: (now = new Date()) => {
    let created = 0
    set((state) => {
      const settings = useSettingsStore.getState()
      const existingIds = new Set((state.attendanceReviewCases ?? []).map(item=>item.id))
      const cases: AttendanceReviewCase[] = []
      for (const record of state.attendance) {
        const employee = state.employees.find(item=>item.id===record.employeeId)
        if (!employee || !isHrManagedEmployee(employee, 'attendance', useSettingsStore.getState().staffRoles.hrManagedRoles)) continue
        const checkInWarnings = buildAttendanceWarnings({ record, employee, defaults:state.employeeDefaultSchedules, overrides:state.scheduleOverrides, settings, nowIso:now.toISOString() })
        const checkOutWarnings = buildCheckoutWarnings({ record, employee, defaults:state.employeeDefaultSchedules, overrides:state.scheduleOverrides, settings, nowIso:now.toISOString() })
        for (const item of [...checkInWarnings, ...checkOutWarnings]) if (!existingIds.has(item.id)) { existingIds.add(item.id); cases.push(item) }
        const missing = shouldCreateMissingCheckoutWarning({ record, employee, defaults:state.employeeDefaultSchedules, overrides:state.scheduleOverrides, settings, now })
        const id=`review-${record.id}-missing_check_out`
        if (missing.due && !existingIds.has(id)) {
          existingIds.add(id)
          cases.push({ id, attendanceId:record.id, employeeId:employee.id, date:record.date, warningType:'missing_check_out', status:'pending', reason:missing.reason ?? 'No checkout was recorded.', scheduledStartTime:record.checkInLocation?.scheduledStartTime, scheduledEndTime:missing.scheduledEnd ?? record.checkInLocation?.scheduledEndTime, detectedBranchId:record.checkInLocation?.detectedBranchId, detectedBranchName:record.checkInLocation?.detectedBranchName, actualTime:undefined, minutesDifference:missing.minutesLate, createdAt:now.toISOString() })
        }
      }
      const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
      const currentTime = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(now)
      const weekStart = toIsoDate(getMondayForDate(today))
      for (const employee of state.employees.filter(item=>item.status==='active' && isHrManagedEmployee(item, 'attendance', useSettingsStore.getState().staffRoles.hrManagedRoles))) {
        const effective = getEffectiveScheduleForDate({ employee, date:today, defaults:state.employeeDefaultSchedules, overrides:state.scheduleOverrides, settings })
        if (!effective.shift.isWorking) continue
        const published = (state.weeklySchedulePublications ?? []).some(item=>item.weekStart===weekStart && (item.branchId==='All' || item.branchId===effective.shift.branchId))
        if (!published) continue
        const hasRecord = state.attendance.some(item=>item.employeeId===employee.id && item.date===today && Boolean(item.checkInAt))
        const minutesPastStart = minutesFromTime(currentTime)-minutesFromTime(effective.shift.startTime)-settings.attendance.lateGraceMinutes
        const id=`review-missing-${employee.id}-${today}-missing_check_in`
        if (!hasRecord && minutesPastStart>=0 && !existingIds.has(id)) {
          existingIds.add(id)
          cases.push({ id, attendanceId:`missing-${employee.id}-${today}`, employeeId:employee.id, date:today, warningType:'missing_check_in', status:'pending', reason:'No check-in was recorded after the scheduled start time.', scheduledBranchId:effective.shift.branchId, scheduledBranchName:settings.branches.find(item=>item.id===effective.shift.branchId)?.name, scheduledStartTime:effective.shift.startTime, scheduledEndTime:effective.shift.endTime, minutesDifference:minutesPastStart, createdAt:now.toISOString() })
        }
      }
      created=cases.length
      return cases.length ? { attendanceReviewCases:[...cases,...(state.attendanceReviewCases ?? [])] } : state
    })
    return created
  },


  generateOrderWarnings: (orders) => {
    let created = 0
    set((state) => {
      const warnings = buildDeliveryLateWarnings({
        orders,
        employees: state.employees,
        existingCases: state.attendanceReviewCases ?? [],
      })
      created = warnings.length
      return warnings.length
        ? { attendanceReviewCases: [...warnings, ...(state.attendanceReviewCases ?? [])] }
        : state
    })
    return created
  },

  reviewAttendanceCase: ({ caseId, decision, note, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.review_attendance')) return { ok:false, reason:'This role cannot review attendance.' }
    let result:{ok:true}|{ok:false;reason:string}={ok:false,reason:'Attendance review could not be saved.'}
    set((state)=>{
      if (!['owner','hr'].includes(actor.role)) { result={ok:false,reason:'Only Owner or HR can review attendance warnings.'}; return state }
      const target=(state.attendanceReviewCases ?? []).find(item=>item.id===caseId)
      if (!target) { result={ok:false,reason:'Attendance warning was not found.'}; return state }
      const targetEmployee=state.employees.find((item)=>item.id===target.employeeId)
      if (!targetEmployee || !canActorManageEmployee(actor.role, targetEmployee.systemRole, 'attendance', useSettingsStore.getState().staffRoles.hrManagedRoles)) { result={ok:false,reason:HR_PROTECTED_ROLE_MESSAGE}; return state }
      if (!['pending','problem'].includes(target.status)) { result={ok:false,reason:'This attendance warning has already been reviewed.'}; return state }
      if (!['resolved','corrected'].includes(decision)) { result={ok:false,reason:'Attendance warnings can only be confirmed or corrected.'}; return state }
      const clean=(note ?? '').trim()
      const reviewedAt=nowIso()
      result={ok:true}
      return {
        attendanceReviewCases:(state.attendanceReviewCases ?? []).map(item=>item.id===caseId
          ? {...item,status:decision,reviewNote:clean || undefined,reviewedBy:actor.name,reviewedAt,proposedMinusPoints:undefined}
          : item),
      }
    })
    return result
  },

  createManualPointAdjustment: ({ employeeId, points, reason, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.manage_points')) return { ok:false, reason:'This role cannot manage points.' }
    let result:{ok:true;entryId:string}|{ok:false;reason:string}={ok:false,reason:'Point adjustment could not be created.'}
    set((state)=>{
      if (!['owner','hr'].includes(actor.role)) { result={ok:false,reason:'Only Owner or HR can create point adjustments.'}; return state }
      const targetEmployee=state.employees.find((item)=>item.id===employeeId)
      if (!targetEmployee) { result={ok:false,reason:'Employee was not found.'}; return state }
      if (!canActorManageEmployee(actor.role, targetEmployee.systemRole, 'points', useSettingsStore.getState().staffRoles.hrManagedRoles)) { result={ok:false,reason:HR_PROTECTED_ROLE_MESSAGE}; return state }
      if (!Number.isInteger(points)||points===0) { result={ok:false,reason:'Points must be a non-zero whole number.'}; return state }
      const clean=reason.trim(); if(!clean){result={ok:false,reason:'Add a reason for the adjustment.'};return state}
      const createdAt=nowIso(); const effectiveDate=getLocalDateString(nowInJakarta()); const payrollPeriodId=getPayrollPeriodIdForActivityDate(effectiveDate,useSettingsStore.getState().getPayrollSettingsForDate(effectiveDate)); const entry:EmployeePointEntry={id:`point-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,employeeId,category:points>0?'manual_reward':'manual_penalty',points,sourceType:'manual',sourceId:`manual:${Date.now()}:${Math.random().toString(36).slice(2,7)}`,effectiveDate,payrollPeriodId,periodKey:payrollPeriodId.replace('payroll-',''),reason:clean,status:'pending',createdBy:actor.name,createdAt}
      result={ok:true,entryId:entry.id}; return {employeePointEntries:[entry,...(state.employeePointEntries??[])]}
    }); return result
  },

  approvePointEntry: ({ entryId, note, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.manage_points')) return { ok:false, reason:'This role cannot manage points.' }
    let result:{ok:true}|{ok:false;reason:string}={ok:false,reason:'Point entry could not be approved.'}
    set((state)=>{
      if (!['owner','hr'].includes(actor.role)){result={ok:false,reason:'Only Owner or HR can approve points.'};return state}
      const target=(state.employeePointEntries??[]).find(item=>item.id===entryId); if(!target){result={ok:false,reason:'Point entry was not found.'};return state}
      const targetEmployee=state.employees.find((item)=>item.id===target.employeeId); if(!targetEmployee||!canActorManageEmployee(actor.role, targetEmployee.systemRole, 'points', useSettingsStore.getState().staffRoles.hrManagedRoles)){result={ok:false,reason:HR_PROTECTED_ROLE_MESSAGE};return state}
      if(target.status!=='pending'){result={ok:false,reason:'Only pending point entries can be approved.'};return state}
      const clean=(note ?? '').trim()
      if (target.points < 0) {
        const periodKey=target.payrollPeriodId?.replace('payroll-','') ?? target.periodKey ?? target.effectiveDate?.slice(0,7) ?? target.createdAt.slice(0,7)
        const approvedMinus=(state.employeePointEntries??[]).filter(item=>item.employeeId===target.employeeId&&item.status==='approved'&&item.points<0&&(item.payrollPeriodId?.replace('payroll-','')??item.periodKey??item.effectiveDate?.slice(0,7)??item.createdAt.slice(0,7))===periodKey).reduce((total,item)=>total+Math.abs(item.points),0)
        const maximum=(state.pointRules??DEFAULT_ORDER_CONTRIBUTION_RULES).maximumMinusPointsPerPeriod
        if (approvedMinus+Math.abs(target.points)>maximum) { result={ok:false,reason:`This approval would exceed the ${maximum}-point minus limit for ${periodKey}.`}; return state }
      }
      result={ok:true}; return {employeePointEntries:state.employeePointEntries.map(item=>item.id===entryId?{...item,status:'approved',reviewNote:clean || undefined,reviewedBy:actor.name,reviewedAt:nowIso()}:item)}
    }); return result
  },

  rejectPointEntry: ({ entryId, note, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.manage_points')) return { ok:false, reason:'This role cannot manage points.' }
    let result:{ok:true}|{ok:false;reason:string}={ok:false,reason:'Point entry could not be rejected.'}
    set((state)=>{
      if (!['owner','hr'].includes(actor.role)){result={ok:false,reason:'Only Owner or HR can reject points.'};return state}
      const target=(state.employeePointEntries??[]).find(item=>item.id===entryId); if(!target){result={ok:false,reason:'Point entry was not found.'};return state}
      const targetEmployee=state.employees.find((item)=>item.id===target.employeeId); if(!targetEmployee||!canActorManageEmployee(actor.role, targetEmployee.systemRole, 'points', useSettingsStore.getState().staffRoles.hrManagedRoles)){result={ok:false,reason:HR_PROTECTED_ROLE_MESSAGE};return state}
      if(target.status!=='pending'){result={ok:false,reason:'Only pending point entries can be rejected.'};return state}
      const clean=note.trim(); if(!clean){result={ok:false,reason:'Add a rejection reason.'};return state}
      result={ok:true}; return {employeePointEntries:state.employeePointEntries.map(item=>item.id===entryId?{...item,status:'rejected',reviewNote:clean,reviewedBy:actor.name,reviewedAt:nowIso()}:item)}
    }); return result
  },

  reversePointEntry: ({ entryId, reason, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.manage_points')) return { ok:false, reason:'This role cannot manage points.' }
    let result:{ok:true;reversalEntryId:string}|{ok:false;reason:string}={ok:false,reason:'Point entry could not be reversed.'}
    set((state)=>{
      if (!['owner','hr'].includes(actor.role)){result={ok:false,reason:'Only Owner or HR can reverse points.'};return state}
      const target=(state.employeePointEntries??[]).find(item=>item.id===entryId); if(!target){result={ok:false,reason:'Point entry was not found.'};return state}
      const targetEmployee=state.employees.find((item)=>item.id===target.employeeId); if(!targetEmployee||!canActorManageEmployee(actor.role, targetEmployee.systemRole, 'points', useSettingsStore.getState().staffRoles.hrManagedRoles)){result={ok:false,reason:HR_PROTECTED_ROLE_MESSAGE};return state}
      if(target.status!=='approved'){result={ok:false,reason:'Only approved point entries can be reversed.'};return state}
      if((state.employeePointEntries??[]).some(item=>item.sourceType==='reversal'&&item.sourceId===entryId)){result={ok:false,reason:'This point entry has already been reversed.'};return state}
      const clean=reason.trim(); if(!clean){result={ok:false,reason:'Add a reversal reason.'};return state}
      const reversalId=`point-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
      const reversal:EmployeePointEntry={id:reversalId,employeeId:target.employeeId,category:'reversal',points:-target.points,sourceType:'reversal',sourceId:target.id,effectiveDate:target.effectiveDate,payrollPeriodId:target.payrollPeriodId,periodKey:target.periodKey??target.effectiveDate?.slice(0,7)??target.createdAt.slice(0,7),reason:clean,status:'approved',createdBy:actor.name,createdAt:nowIso(),reviewedBy:actor.name,reviewedAt:nowIso()}
      result={ok:true,reversalEntryId:reversalId}; return {employeePointEntries:[reversal,...state.employeePointEntries.map(item=>item.id===entryId?{...item,status:'reversed' as const,reversedByEntryId:reversalId}:item)]}
    }); return result
  },


  updatePointRules: ({ rules, actor }) => {
    if (!isActionAuthorized(actor.role, 'hr.manage_points')) return { ok:false, reason:'This role cannot manage points.' }
    let result:{ok:true}|{ok:false;reason:string;field?:keyof OrderContributionRules}={ok:false,reason:'Point rules could not be saved.'}
    set((state)=>{
      if (!['owner','hr'].includes(actor.role)) { result={ok:false,reason:'Only Owner or HR can edit point rules.'}; return state }
      const validation=validateOrderContributionRules(rules)
      if (!validation.ok) { result={ok:false,reason:validation.reason,field:validation.field}; return state }
      result={ok:true}
      return {pointRules:{...rules}}
    })
    return result
  },

  syncOrderContributionPoints: ({ orders, actor }) => {
    if (isSharedBackendConfigured()) return { ok:true, created:0, reversed:0 }
    let result:{ok:true;created:number;reversed:number}|{ok:false;reason:string}={ok:false,reason:'Order contribution points could not be synchronized.'}
    set((state)=>{
      if (!['owner','hr','finance'].includes(actor.role)) { result={ok:false,reason:'Only Owner, HR, or Finance can synchronize order points.'}; return state }
      const expected=buildExpectedOrderContributions({orders,employees:state.employees.filter((employee) => actor.role === 'owner' ? employee.systemRole !== 'owner' : isHrManagedEmployee(employee, 'points', useSettingsStore.getState().staffRoles.hrManagedRoles)),rules:state.pointRules ?? DEFAULT_ORDER_CONTRIBUTION_RULES,payrollSettings:useSettingsStore.getState().payroll})
      const expectedBySource=new Map(expected.map(item=>[item.sourceId,item]))
      const now=nowIso()
      let created=0
      let reversed=0
      let entries=[...(state.employeePointEntries??[])]

      // Contributions that are no longer eligible are never silently deleted.
      // Pending entries are rejected; approved entries receive an opposite approved reversal.
      for (const existing of [...entries]) {
        if (existing.sourceType!=='order' || existing.category==='reversal' || expectedBySource.has(existing.sourceId)) continue
        if (existing.status==='pending') {
          entries=entries.map(item=>item.id===existing.id?{...item,status:'rejected' as const,reviewedBy:actor.name,reviewedAt:now,reviewNote:'Order no longer qualifies for contribution points.'}:item)
        } else if (existing.status==='approved' && !entries.some(item=>item.sourceType==='reversal'&&item.sourceId===existing.id)) {
          const reversalId=`point-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
          const reversal:EmployeePointEntry={id:reversalId,employeeId:existing.employeeId,category:'reversal',points:-existing.points,sourceType:'reversal',sourceId:existing.id,effectiveDate:existing.effectiveDate,payrollPeriodId:existing.payrollPeriodId,periodKey:existing.periodKey,orderNumber:existing.orderNumber,sourceAmountIdr:existing.sourceAmountIdr,sourceCompletedAt:existing.sourceCompletedAt,reason:'Order contribution reversed because the order no longer qualifies.',status:'approved',createdBy:actor.name,createdAt:now,reviewedBy:actor.name,reviewedAt:now}
          entries=[reversal,...entries.map(item=>item.id===existing.id?{...item,status:'reversed' as const,reversedByEntryId:reversalId}:item)]
          reversed+=1
        }
      }

      for (const contribution of expected) {
        const active=entries.find(item=>item.sourceType==='order'&&item.sourceId===contribution.sourceId&&item.status!=='rejected'&&item.status!=='reversed')
        const matchesRule=active && active.points===contribution.points && active.ordinal===contribution.ordinal && active.minimumIncluded===contribution.minimumIncluded
        if (matchesRule) continue
        if (active?.status==='pending') {
          entries=entries.map(item=>item.id===active.id?{...item,status:'rejected' as const,reviewedBy:actor.name,reviewedAt:now,reviewNote:'Point rule changed; replaced by a recalculated pending entry.'}:item)
        } else if (active?.status==='approved' && !entries.some(item=>item.sourceType==='reversal'&&item.sourceId===active.id)) {
          const reversalId=`point-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
          const reversal:EmployeePointEntry={id:reversalId,employeeId:active.employeeId,category:'reversal',points:-active.points,sourceType:'reversal',sourceId:active.id,effectiveDate:active.effectiveDate,payrollPeriodId:active.payrollPeriodId,periodKey:active.periodKey,orderNumber:active.orderNumber,sourceAmountIdr:active.sourceAmountIdr,sourceCompletedAt:active.sourceCompletedAt,reason:'Approved contribution reversed because the point rule changed.',status:'approved',createdBy:actor.name,createdAt:now,reviewedBy:actor.name,reviewedAt:now}
          entries=[reversal,...entries.map(item=>item.id===active.id?{...item,status:'reversed' as const,reversedByEntryId:reversalId}:item)]
          reversed+=1
        }
        const entry:EmployeePointEntry={
          id:`point-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
          employeeId:contribution.employeeId,
          category:contribution.category,
          points:contribution.points,
          sourceType:'order',
          sourceId:contribution.sourceId,
          effectiveDate:contribution.effectiveDate,
          payrollPeriodId:contribution.payrollPeriodId,
          periodKey:contribution.periodKey,
          orderNumber:contribution.orderNumber,
          sourceAmountIdr:contribution.sourceAmountIdr,
          sourceCompletedAt:contribution.sourceCompletedAt,
          ordinal:contribution.ordinal,
          minimumIncluded:contribution.minimumIncluded,
          reason:`Order completion reward · product subtotal meets the minimum.`,
          status:'approved',
          createdBy:actor.name,
          createdAt:now,
          reviewedBy:actor.name,
          reviewedAt:now,
        }
        entries=[entry,...entries]
        created+=1
      }
      result={ok:true,created,reversed}
      return {employeePointEntries:entries}
    })
    return result
  },

}))

export type { EmployeeStatus }
