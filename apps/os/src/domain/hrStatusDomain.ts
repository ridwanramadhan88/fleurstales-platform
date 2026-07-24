import type { UserRole } from '../store/userStore'
import type { AttendanceStatus, Employee } from '../store/hrStoreTypes'
import { canActorManageEmployee, HR_PROTECTED_ROLE_MESSAGE } from './hrManagedEmployeeDomain'
import { useSettingsStore } from '../store/settingsStore'
export interface HrActor { name: string; role: UserRole }
export type HrCommandResult = { ok: true } | { ok: false; reason: string }
const canManageHr = (role: UserRole): boolean => role === 'owner' || role === 'hr'
export const canSetEmployeeActiveState = (params: { employees: Employee[]; employeeId: string; active: boolean; actor: HrActor }): HrCommandResult => {
  if (!canManageHr(params.actor.role)) return { ok: false, reason: 'HR permission required.' }
  const employee = params.employees.find((item) => item.id === params.employeeId)
  if (!employee) return { ok: false, reason: 'Employee not found.' }
  if (!canActorManageEmployee(params.actor.role, employee.systemRole, 'employees', useSettingsStore.getState().staffRoles.hrManagedRoles)) return { ok: false, reason: HR_PROTECTED_ROLE_MESSAGE }
  const nextStatus = params.active ? 'active' : 'inactive'
  if (employee.status === nextStatus) return { ok: false, reason: 'Employee already has that status.' }
  if (!params.active && employee.systemRole === 'owner') {
    const activeOwners = params.employees.filter((item) => item.systemRole === 'owner' && item.status === 'active')
    if (activeOwners.length <= 1) return { ok: false, reason: 'Cannot deactivate the last active owner.' }
  }
  return { ok: true }
}
export const canRecordAttendance = (params: { employee?: Employee; date: string; status: AttendanceStatus; actor: HrActor }): HrCommandResult => {
  if (!canManageHr(params.actor.role)) return { ok: false, reason: 'HR permission required.' }
  if (!params.employee) return { ok: false, reason: 'Employee not found.' }
  if (!canActorManageEmployee(params.actor.role, params.employee.systemRole, 'attendance', useSettingsStore.getState().staffRoles.hrManagedRoles)) return { ok: false, reason: HR_PROTECTED_ROLE_MESSAGE }
  if (params.employee.status !== 'active') return { ok: false, reason: 'Attendance can only be recorded for active employees.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) return { ok: false, reason: 'Attendance date is invalid.' }
  if (!['present', 'late', 'absent', 'leave'].includes(params.status)) return { ok: false, reason: 'Attendance status is invalid.' }
  if (!params.actor.name.trim()) return { ok: false, reason: 'Attendance actor is required.' }
  return { ok: true }
}


const dataUrlByteSize = (value: string): number => {
  const base64 = value.split(',')[1] ?? ''
  return Math.ceil((base64.length * 3) / 4)
}

const isValidCompressedSelfie = (value: string): boolean =>
  value.startsWith('data:image/jpeg;base64,') && dataUrlByteSize(value) <= 100 * 1024

export const canRecordSelfieAttendance = (params: {
  employee?: Employee
  date: string
  today: string
  selfieDataUrl: string
  actor: HrActor
  alreadyRecorded: boolean
  locationWithinRange?: boolean
}): HrCommandResult => {
  if (!params.employee) return { ok: false, reason: 'Employee record was not found for this account.' }
  if (!['admin', 'florist'].includes(params.actor.role)) return { ok: false, reason: 'Only Admin and Florist accounts can use selfie attendance.' }
  if (params.employee.systemRole !== params.actor.role) return { ok: false, reason: 'This account is not linked to the selected employee.' }
  if (params.employee.status !== 'active') return { ok: false, reason: 'Inactive employees cannot check in.' }
  if (params.date !== params.today) return { ok: false, reason: 'Selfie attendance can only be recorded for today.' }
  if (params.locationWithinRange === false) return { ok: false, reason: 'You are outside the accepted branch attendance area.' }
  if (!isValidCompressedSelfie(params.selfieDataUrl)) return { ok: false, reason: 'A square JPEG selfie of 100 KB or less is required.' }
  if (params.alreadyRecorded) return { ok: false, reason: 'Attendance has already been recorded for today.' }
  if (!params.actor.name.trim()) return { ok: false, reason: 'Attendance actor is required.' }
  return { ok: true }
}

export const canRecordSelfieCheckOut = (params: {
  employee?: Employee
  date: string
  today: string
  currentTime: string
  branchIsOpen: boolean
  branchClosesAt?: string
  selfieDataUrl: string
  actor: HrActor
  attendance?: { source?: 'manual' | 'selfie'; checkInAt?: string; checkOutAt?: string }
  locationWithinRange?: boolean
}): HrCommandResult => {
  if (!params.employee) return { ok: false, reason: 'Employee record was not found for this account.' }
  if (!['admin', 'florist'].includes(params.actor.role)) return { ok: false, reason: 'Only Admin and Florist accounts can use selfie attendance.' }
  if (params.employee.systemRole !== params.actor.role) return { ok: false, reason: 'This account is not linked to the selected employee.' }
  if (params.employee.status !== 'active') return { ok: false, reason: 'Inactive employees cannot check out.' }
  if (params.date !== params.today) return { ok: false, reason: 'Selfie check-out can only be recorded for today.' }
  if (!params.attendance || params.attendance.source !== 'selfie' || !params.attendance.checkInAt) return { ok: false, reason: 'A selfie check-in is required before check-out.' }
  if (params.attendance.checkOutAt) return { ok: false, reason: 'Check-out has already been recorded for today.' }
  if (!params.branchIsOpen || !params.branchClosesAt) return { ok: false, reason: 'The branch has no working hours for today.' }
  if (params.currentTime < params.branchClosesAt) return { ok: false, reason: `Check-out becomes available after ${params.branchClosesAt}.` }
  if (params.locationWithinRange === false) return { ok: false, reason: 'You are outside the accepted branch attendance area.' }
  if (!isValidCompressedSelfie(params.selfieDataUrl)) return { ok: false, reason: 'A square JPEG selfie of 100 KB or less is required.' }
  if (!params.actor.name.trim()) return { ok: false, reason: 'Attendance actor is required.' }
  return { ok: true }
}
