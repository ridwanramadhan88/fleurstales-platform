import { getAccessLevel, type AccessLevel } from '../config/permissions'
import type { Employee, EmployeeDefaultSchedule, ScheduleOverride, ScheduleShift } from '../store/hrStoreTypes'
import type { UserRole } from '../store/userStore'
import type { BranchSettings, DefaultWeeklySchedule, OwnerSettingsStateValue, ScheduleShiftMode, WeekdayKey } from '../types/settings'
import { DEFAULT_BRANCH_OPENING_HOURS, WEEKDAY_KEYS } from './branchOpeningHoursDomain'

export const DEFAULT_COMPANY_WEEKLY_SCHEDULE: DefaultWeeklySchedule = {
  monday: { mode:'follow_branch_hours', isWorking: true, startTime: '09:00', endTime: '18:00' },
  tuesday: { mode:'follow_branch_hours', isWorking: true, startTime: '09:00', endTime: '18:00' },
  wednesday: { mode:'follow_branch_hours', isWorking: true, startTime: '09:00', endTime: '18:00' },
  thursday: { mode:'follow_branch_hours', isWorking: true, startTime: '09:00', endTime: '18:00' },
  friday: { mode:'follow_branch_hours', isWorking: true, startTime: '09:00', endTime: '18:00' },
  saturday: { mode:'follow_branch_hours', isWorking: true, startTime: '09:00', endTime: '18:00' },
  sunday: { mode:'off', isWorking: false, startTime: '09:00', endTime: '18:00' },
}

const schedulingAccessLevel = (role: UserRole, permissions: OwnerSettingsStateValue['permissions']): AccessLevel => getAccessLevel(role, 'scheduling', permissions)
export const canViewScheduling = (role: UserRole, permissions: OwnerSettingsStateValue['permissions']): boolean => schedulingAccessLevel(role, permissions) !== 'none'
export const canEditScheduling = (role: UserRole, permissions: OwnerSettingsStateValue['permissions']): boolean => schedulingAccessLevel(role, permissions) === 'edit'

const DAY_MAP: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export const getWeekdayKey = (date: string): WeekdayKey => {
  const [year, month, day] = date.split('-').map(Number)
  return DAY_MAP[new Date(year, month - 1, day).getDay()]
}
export const toIsoDate = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
export const getMondayForDate = (value: string | Date): Date => {
  const date = typeof value === 'string' ? (() => { const [y,m,d]=value.split('-').map(Number); return new Date(y,m-1,d) })() : new Date(value)
  const day=date.getDay(); date.setDate(date.getDate()+(day===0?-6:1-day)); date.setHours(0,0,0,0); return date
}
export const getWeekDates = (weekStart: string | Date): string[] => {
  const monday=getMondayForDate(weekStart)
  return Array.from({length:7},(_,index)=>{ const date=new Date(monday); date.setDate(monday.getDate()+index); return toIsoDate(date) })
}

export const getShiftMode = (shift: Pick<ScheduleShift,'mode'|'isWorking'>): ScheduleShiftMode => !shift.isWorking ? 'off' : (shift.mode ?? 'custom')

const applyRoleShiftRule = (employee: Pick<Employee,'systemRole'>, shift: ScheduleShift): ScheduleShift => {
  if (shift.isWorking && shift.branchId === 'Kedamaian' && employee.systemRole === 'admin') {
    return { ...shift, mode:'custom', startTime:'07:30', endTime:'16:30' }
  }
  return shift
}

const openingHoursFor = (branch: BranchSettings | undefined, weekday: WeekdayKey) => (branch?.openingHours ?? DEFAULT_BRANCH_OPENING_HOURS)[weekday]

/** Captures the current branch opening window into start/end so past dates remain historically stable. */
export const materializeScheduleShift = (shift: ScheduleShift, branch: BranchSettings | undefined, weekday: WeekdayKey): ScheduleShift => {
  const mode=getShiftMode(shift)
  if (mode==='off') return { ...shift, mode:'off', isWorking:false }
  if (mode==='follow_branch_hours') {
    const hours=openingHoursFor(branch,weekday)
    return { ...shift, mode:'follow_branch_hours', isWorking:hours.isOpen, startTime:hours.opensAt, endTime:hours.closesAt }
  }
  return { ...shift, mode:'custom', isWorking:true }
}

/** Future inherited shifts resolve live from branch hours; past dates use their stored snapshot. */
const resolveScheduleShift = (shift: ScheduleShift, branch: BranchSettings | undefined, weekday: WeekdayKey, date?: string): ScheduleShift => {
  const mode=getShiftMode(shift)
  if (mode!=='follow_branch_hours') return mode==='off' ? { ...shift, mode:'off', isWorking:false } : { ...shift, mode:'custom', isWorking:true }
  const today=toIsoDate(new Date())
  if (date && date < today) return { ...shift, mode:'follow_branch_hours' }
  return materializeScheduleShift({ ...shift, mode:'follow_branch_hours', isWorking:true },branch,weekday)
}


export const getEffectiveScheduleForDate = (params: { employee:Employee; date:string; defaults:EmployeeDefaultSchedule[]; overrides:ScheduleOverride[]; settings:Pick<OwnerSettingsStateValue,'scheduling'|'branches'> }): { shift:ScheduleShift; source:'override'|'employee_default'|'company_default' } => {
  const weekday=getWeekdayKey(params.date)
  const override=params.overrides.find(item=>item.employeeId===params.employee.id && item.date===params.date)
  if (override) {
    const branch=params.settings.branches.find(item=>item.id===override.shift.branchId)
    return { shift:applyRoleShiftRule(params.employee, resolveScheduleShift(override.shift,branch,weekday,params.date)), source:'override' }
  }
  const personal=params.defaults.find(item=>item.employeeId===params.employee.id)
  if (personal) {
    const shift=personal.days[weekday]; const branch=params.settings.branches.find(item=>item.id===shift.branchId)
    return { shift:applyRoleShiftRule(params.employee, resolveScheduleShift(shift,branch,weekday,params.date)), source:'employee_default' }
  }
  const template=params.settings.scheduling.defaultWeeklySchedule[weekday]
  return { shift:{ ...template, mode:'off', isWorking:false, branchId:'' }, source:'company_default' }
}

const toMinutes=(value:string):number=>{ const [hour,minute]=value.split(':').map(Number); return hour*60+minute }
export const validateScheduleShift = (params:{ shift:ScheduleShift; branch:BranchSettings|undefined; weekday:WeekdayKey }):string|null => {
  const {shift,branch,weekday}=params; const mode=getShiftMode(shift)
  if (mode==='off') return null
  if (!branch?.isActive) return 'Select an active branch.'
  const hours=openingHoursFor(branch,weekday)
  if (!hours.isOpen) return `${branch.name} is closed on this day.`
  if (mode==='follow_branch_hours') return null
  if (!/^\d{2}:\d{2}$/.test(shift.startTime)||!/^\d{2}:\d{2}$/.test(shift.endTime)) return 'Select valid start and end times.'
  if (toMinutes(shift.startTime)>=toMinutes(shift.endTime)) return 'Shift start must be earlier than shift end.'
  if (toMinutes(shift.startTime)<toMinutes(hours.opensAt)||toMinutes(shift.endTime)>toMinutes(hours.closesAt)) return `Shift must stay within ${branch.name} hours (${hours.opensAt}–${hours.closesAt}).`
  return null
}

export interface ScheduleImpactSummary { inheritedFutureShifts:number; invalidCustomShifts:number }
export const summarizeScheduleImpacts = (params:{ employees:Employee[]; defaults:EmployeeDefaultSchedule[]; overrides:ScheduleOverride[]; settings:Pick<OwnerSettingsStateValue,'scheduling'|'branches'>; fromDate?:string }):ScheduleImpactSummary => {
  const from=params.fromDate ?? toIsoDate(new Date()); let inheritedFutureShifts=0; let invalidCustomShifts=0
  for (const override of params.overrides) {
    if (override.date < from) continue
    const mode=getShiftMode(override.shift); const branch=params.settings.branches.find(item=>item.id===override.shift.branchId); const weekday=getWeekdayKey(override.date)
    if (mode==='follow_branch_hours') inheritedFutureShifts++
    if (mode==='custom' && validateScheduleShift({shift:override.shift,branch,weekday})) invalidCustomShifts++
  }
  for (const item of params.defaults) for (const day of WEEKDAY_KEYS) {
    const shift=item.days[day]; const mode=getShiftMode(shift); const branch=params.settings.branches.find(b=>b.id===shift.branchId)
    if (mode==='follow_branch_hours') inheritedFutureShifts++
    if (mode==='custom' && validateScheduleShift({shift,branch,weekday:day})) invalidCustomShifts++
  }
  return { inheritedFutureShifts, invalidCustomShifts }
}

export interface DailyCoverageSummary {
  branchId: string
  branchName: string
  date: string
  adminScheduled: number
  floristScheduled: number
  adminRequired: number
  floristRequired: number
  isOpen: boolean
  hasShortage: boolean
}

export const summarizeWeeklyCoverage = (params:{
  employees: Employee[]
  dates: string[]
  defaults: EmployeeDefaultSchedule[]
  overrides: ScheduleOverride[]
  settingsForDate: (date:string) => Pick<OwnerSettingsStateValue,'scheduling'|'branches'>
  branchIds?: string[]
}): DailyCoverageSummary[] => {
  const result: DailyCoverageSummary[] = []
  for (const date of params.dates) {
    const settings = params.settingsForDate(date)
    const minimum = settings.scheduling.minimumCoverage ?? { admin:1, florist:2 }
    const allowed = params.branchIds?.length ? settings.branches.filter(branch=>params.branchIds?.includes(branch.id)) : settings.branches
    for (const branch of allowed.filter(item=>item.isActive)) {
      const weekday = getWeekdayKey(date)
      const isOpen = openingHoursFor(branch,weekday).isOpen
      let adminScheduled = 0
      let floristScheduled = 0
      for (const employee of params.employees.filter(item=>item.status==='active' && (item.systemRole==='admin' || item.systemRole==='florist'))) {
        const effective = getEffectiveScheduleForDate({ employee, date, defaults:params.defaults, overrides:params.overrides, settings })
        if (!effective.shift.isWorking || effective.shift.branchId !== branch.id) continue
        if (employee.systemRole === 'admin') adminScheduled++
        if (employee.systemRole === 'florist') floristScheduled++
      }
      result.push({ branchId:branch.id, branchName:branch.name, date, adminScheduled, floristScheduled, adminRequired:isOpen?minimum.admin:0, floristRequired:isOpen?minimum.florist:0, isOpen, hasShortage:isOpen && (adminScheduled<minimum.admin || floristScheduled<minimum.florist) })
    }
  }
  return result
}
