/**
 * @file hrDomain.ts
 * @description Domain layer for the HR module.
 * Contains business logic built on top of raw employee/attendance data:
 * - Branch-scoped filtering.
 * - Today's attendance lookups and summary counts.
 *
 * This file is PURE and has no side effects:
 * - No React / UI imports.
 * - No direct store mutations.
 * - All functions are deterministic based on their inputs.
 */

import type { BranchId } from '../types/orders'
import type { AttendanceRecord, Employee, EmployeeStatus } from '../store/hrStoreTypes'

/**
 * @description Status filters exposed to UI.
 */
export type EmployeeStatusFilter = 'all' | EmployeeStatus

/**
 * @description Aggregated HR summary for a set of employees + today's attendance.
 */
export interface HrSummary {
  activeCount: number
  inactiveCount: number
  presentToday: number
  lateToday: number
  absentToday: number
  onLeaveToday: number
  notMarkedToday: number
}

/**
 * @description Returns employees scoped to a branch.
 */
export const getBranchEmployees = (
  employees: Employee[],
  branch: BranchId | 'All',
): Employee[] =>
  employees.filter(
    (employee) => branch === 'All' || employee.branch === branch,
  )

/**
 * @description Applies a status filter to an employee list.
 */
export const getFilteredEmployees = (
  employees: Employee[],
  statusFilter: EmployeeStatusFilter,
): Employee[] =>
  employees.filter(
    (employee) => statusFilter === 'all' || employee.status === statusFilter,
  )

/**
 * @description Returns the attendance record for one employee on one date, if any.
 */
export const getAttendanceForEmployeeOnDate = (
  attendance: AttendanceRecord[],
  employeeId: string,
  date: string,
): AttendanceRecord | null =>
  attendance.find(
    (record) => record.employeeId === employeeId && record.date === date,
  ) ?? null

/**
 * @description Computes the HR summary (headcount + today's attendance
 * breakdown) for a branch-scoped employee list.
 */
export const getHrSummary = (
  employees: Employee[],
  attendance: AttendanceRecord[],
  today: string,
): HrSummary => {
  const activeEmployees = employees.filter((employee) => employee.status === 'active')

  let presentToday = 0
  let lateToday = 0
  let absentToday = 0
  let onLeaveToday = 0

  activeEmployees.forEach((employee) => {
    const record = getAttendanceForEmployeeOnDate(attendance, employee.id, today)
    if (!record) return
    if (record.status === 'present') presentToday += 1
    if (record.status === 'late') lateToday += 1
    if (record.status === 'absent') absentToday += 1
    if (record.status === 'leave') onLeaveToday += 1
  })

  const markedToday = presentToday + lateToday + absentToday + onLeaveToday

  return {
    activeCount: activeEmployees.length,
    inactiveCount: employees.length - activeEmployees.length,
    presentToday,
    lateToday,
    absentToday,
    onLeaveToday,
    notMarkedToday: Math.max(0, activeEmployees.length - markedToday),
  }
}
