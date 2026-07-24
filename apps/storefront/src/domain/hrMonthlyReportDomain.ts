import type { OwnerSettingsStateValue } from '../types/settings'
import type { AttendanceRecord, AttendanceReviewCase, Employee, EmployeeDefaultSchedule, ScheduleOverride } from '../store/hrStoreTypes'
import { getEffectiveScheduleForDate } from './hrSchedulingDomain'

export interface HrMonthlyEmployeeReport {
  employeeId: string
  employeeName: string
  role: string
  scheduledDays: number
  kedamaianDays: number
  pahomanDays: number
  presentDays: number
  leaveDays: number
  offDays: number
  lateTasks: number
  missingCheckInTasks: number
  missingCheckOutTasks: number
  openProblems: number
}

const daysInMonth = (month: string): string[] => {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return []
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return Array.from({ length: count }, (_, index) => `${year}-${String(monthNumber).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`)
}

export const buildHrMonthlyReport = (params: {
  month: string
  employees: Employee[]
  attendance: AttendanceRecord[]
  reviewCases: AttendanceReviewCase[]
  defaults: EmployeeDefaultSchedule[]
  overrides: ScheduleOverride[]
  settings: OwnerSettingsStateValue
  branchId?: string | 'All'
}): HrMonthlyEmployeeReport[] => {
  const dates = daysInMonth(params.month)
  return params.employees
    .filter((employee) => employee.status === 'active' && ['admin', 'florist'].includes(employee.systemRole))
    .map((employee) => {
      const row: HrMonthlyEmployeeReport = {
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.systemRole,
        scheduledDays: 0,
        kedamaianDays: 0,
        pahomanDays: 0,
        presentDays: 0,
        leaveDays: 0,
        offDays: 0,
        lateTasks: 0,
        missingCheckInTasks: 0,
        missingCheckOutTasks: 0,
        openProblems: 0,
      }

      for (const date of dates) {
        const effective = getEffectiveScheduleForDate({ employee, date, defaults: params.defaults, overrides: params.overrides, settings: params.settings })
        const inBranchScope = !effective.shift.isWorking || !params.branchId || params.branchId === 'All' || effective.shift.branchId === params.branchId
        if (!inBranchScope) continue
        if (effective.shift.isWorking) {
          row.scheduledDays += 1
          const branchName = params.settings.branches.find((branch) => branch.id === effective.shift.branchId)?.name.toLowerCase() ?? effective.shift.branchId.toLowerCase()
          if (branchName.includes('kedamaian')) row.kedamaianDays += 1
          if (branchName.includes('pahoman')) row.pahomanDays += 1
        } else {
          row.offDays += 1
        }
        const record = params.attendance.find((item) => item.employeeId === employee.id && item.date === date)
        if (record?.checkInAt || record?.status === 'present' || record?.status === 'late') row.presentDays += 1
        if (record?.status === 'leave') row.leaveDays += 1
      }

      const cases = params.reviewCases.filter((item) => item.employeeId === employee.id && item.date.startsWith(params.month))
      row.lateTasks = cases.filter((item) => item.warningType === 'late_check_in').length
      row.missingCheckInTasks = cases.filter((item) => item.warningType === 'missing_check_in').length
      row.missingCheckOutTasks = cases.filter((item) => item.warningType === 'missing_check_out').length
      row.openProblems = cases.filter((item) => item.status === 'problem').length
      return row
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.employeeName.localeCompare(b.employeeName))
}

export const monthlyReportToCsv = (rows: HrMonthlyEmployeeReport[]): string => {
  const headers = ['Employee', 'Role', 'Scheduled days', 'Kedamaian days', 'Pahoman days', 'Present days', 'Leave days', 'OFF days', 'Late review tasks', 'Missing check-in tasks', 'Missing checkout tasks', 'Open HR problems']
  const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
  return [headers.map(escape).join(','), ...rows.map((row) => [row.employeeName, row.role, row.scheduledDays, row.kedamaianDays, row.pahomanDays, row.presentDays, row.leaveDays, row.offDays, row.lateTasks, row.missingCheckInTasks, row.missingCheckOutTasks, row.openProblems].map(escape).join(','))].join('\n')
}
