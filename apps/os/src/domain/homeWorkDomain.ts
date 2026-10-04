/**
 * @file homeWorkDomain.ts
 * @description What each role's home screen counts. Pure functions so every
 * number on a home card has one definition and a test.
 */

import type { AttendanceRecord, AttendanceReviewCase, Employee, ScheduleOverride } from '../store/hrStoreTypes'
import type { PayrollProposal } from '../store/payrollStore'

/** One line for staff: attendance today and their shift. */
export interface MyDayStatus {
  attendance: 'not_checked_in' | 'checked_in' | 'done' | 'off'
  checkInTime?: string
  shift?: { branchId: string; startTime: string; endTime: string }
}

export const getMyDayStatus = ({
  employeeId,
  today,
  attendance,
  overrides,
}: {
  employeeId?: string
  today: string
  attendance: Pick<AttendanceRecord, 'employeeId' | 'date' | 'checkInAt' | 'checkOutAt'>[]
  overrides: Pick<ScheduleOverride, 'employeeId' | 'date' | 'shift'>[]
}): MyDayStatus => {
  const shift = overrides.find((item) => item.employeeId === employeeId && item.date === today)?.shift
  const record = attendance.find((item) => item.employeeId === employeeId && item.date === today)
  const workingShift = shift?.isWorking ? { branchId: shift.branchId, startTime: shift.startTime, endTime: shift.endTime } : undefined
  if (shift && !shift.isWorking && !record?.checkInAt) return { attendance: 'off' }
  if (record?.checkInAt && record.checkOutAt) return { attendance: 'done', checkInTime: record.checkInAt, shift: workingShift }
  if (record?.checkInAt) return { attendance: 'checked_in', checkInTime: record.checkInAt, shift: workingShift }
  return { attendance: 'not_checked_in', shift: workingShift }
}

export interface HrHomeWork {
  /** Attendance review cases still open for HR. */
  attendanceToReview: number
  /** Active staff (not Owner) with at least one day this week without a schedule. */
  unscheduledStaff: number
  /** Latest payroll proposal status, or null when none exists yet. */
  payrollStatus: PayrollProposal['status'] | null
}

export const getHrHomeWork = ({
  reviewCases,
  employees,
  overrides,
  weekDates,
  payrollProposals,
}: {
  reviewCases: Pick<AttendanceReviewCase, 'status'>[]
  employees: Pick<Employee, 'id' | 'status' | 'systemRole'>[]
  overrides: Pick<ScheduleOverride, 'employeeId' | 'date'>[]
  weekDates: string[]
  payrollProposals: Pick<PayrollProposal, 'status' | 'createdAt'>[]
}): HrHomeWork => {
  const attendanceToReview = reviewCases.filter((item) => item.status === 'pending' || item.status === 'problem').length
  const scheduled = new Set(overrides.map((item) => `${item.employeeId}|${item.date}`))
  const unscheduledStaff = employees
    .filter((employee) => employee.status === 'active' && employee.systemRole !== 'owner')
    .filter((employee) => weekDates.some((date) => !scheduled.has(`${employee.id}|${date}`)))
    .length
  const latest = [...payrollProposals].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  return { attendanceToReview, unscheduledStaff, payrollStatus: latest?.status ?? null }
}
