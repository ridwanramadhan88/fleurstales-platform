import type {
  AttendanceRecord,
  AttendanceReviewCase,
  Employee,
  EmployeeDefaultSchedule,
  EmployeePointEntry,
  ScheduleOverride,
  ScheduleRevision,
  WeeklySchedulePublication,
} from '../store/hrStoreTypes'
import type { EmployeeCompensation, EmployeePayrollDraft } from '../store/payrollStore'
import type { OrderTableRow } from '../types/orders'

/** Employment status is independent from account/payroll setup completeness. */
export type EmployeeOperationalState = 'setup_required' | 'active' | 'inactive'

export interface EmployeeReadiness {
  /** Active/inactive follows employment status only. `setup_required` remains for compatibility with older persisted UI state. */
  state: EmployeeOperationalState
  setupComplete: boolean
  missing: Array<'Login account' | 'Recovery email' | 'Salary'>
  effectiveBaseSalaryIdr: number
}

export const getEmployeeReadiness = ({
  employee,
  roleSalaryIdr,
  productionAuth,
}: {
  employee: Employee
  roleSalaryIdr?: number
  productionAuth: boolean
}): EmployeeReadiness => {
  const effectiveBaseSalaryIdr = employee.baseSalaryIdr && employee.baseSalaryIdr > 0
    ? employee.baseSalaryIdr
    : Math.max(0, Math.round(roleSalaryIdr ?? 0))
  const missing: EmployeeReadiness['missing'] = []
  if (!employee.username || (!productionAuth && !employee.pin)) missing.push('Login account')
  if (productionAuth && !employee.email) missing.push('Recovery email')
  if (effectiveBaseSalaryIdr <= 0) missing.push('Salary')
  return {
    state: employee.status === 'inactive' ? 'inactive' : 'active',
    setupComplete: missing.length === 0,
    missing,
    effectiveBaseSalaryIdr,
  }
}

/** Scheduling and attendance follow employment status; missing login/salary remains a setup warning, not a roster exclusion. */
export const isEmployeeOperationallyReady = (params: Parameters<typeof getEmployeeReadiness>[0]): boolean =>
  getEmployeeReadiness(params).state === 'active'

export interface EmployeeRemovalBlocker {
  key: 'attendance' | 'attendanceReviews' | 'orders' | 'payroll' | 'points' | 'publishedSchedules' | 'scheduleHistory'
  label: string
  count: number
}

const publicationContainsDate = (publication: WeeklySchedulePublication, date: string): boolean => {
  const start = new Date(`${publication.weekStart}T00:00:00Z`)
  const target = new Date(`${date}T00:00:00Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  return target >= start && target <= end
}

export const getEmployeeRemovalBlockers = ({
  employeeId,
  attendance,
  attendanceReviews,
  points,
  scheduleOverrides,
  scheduleRevisions,
  schedulePublications,
  orders,
  payrollDrafts,
  compensations,
  today,
}: {
  employeeId: string
  attendance: AttendanceRecord[]
  attendanceReviews: AttendanceReviewCase[]
  points: EmployeePointEntry[]
  employeeDefaultSchedules?: EmployeeDefaultSchedule[]
  scheduleOverrides: ScheduleOverride[]
  scheduleRevisions: ScheduleRevision[]
  schedulePublications: WeeklySchedulePublication[]
  orders: OrderTableRow[]
  payrollDrafts: EmployeePayrollDraft[]
  compensations: EmployeeCompensation[]
  today: string
}): EmployeeRemovalBlocker[] => {
  const attendanceCount = attendance.filter((item) => item.employeeId === employeeId).length
  const reviewCount = attendanceReviews.filter((item) => item.employeeId === employeeId).length
  const pointCount = points.filter((item) => item.employeeId === employeeId).length
  const orderCount = orders.filter((item) =>
    item.floristAssignedEmployeeId === employeeId
    || item.adminHandledEmployeeId === employeeId
    || item.floristAssignedByEmployeeId === employeeId,
  ).length
  const payrollCount = payrollDrafts.filter((item) => item.employeeId === employeeId).length
    + compensations.filter((item) => item.employeeId === employeeId).length
  const scheduleHistoryCount = scheduleRevisions.filter((item) => item.employeeId === employeeId).length
    + scheduleOverrides.filter((item) => item.employeeId === employeeId && item.date <= today).length
  const publishedScheduleCount = scheduleOverrides.filter((item) =>
    item.employeeId === employeeId
    && schedulePublications.some((publication) => publicationContainsDate(publication, item.date)),
  ).length

  return [
    attendanceCount ? { key:'attendance' as const, label:'attendance records', count:attendanceCount } : null,
    reviewCount ? { key:'attendanceReviews' as const, label:'attendance review cases', count:reviewCount } : null,
    orderCount ? { key:'orders' as const, label:'assigned or handled orders', count:orderCount } : null,
    payrollCount ? { key:'payroll' as const, label:'payroll or salary records', count:payrollCount } : null,
    pointCount ? { key:'points' as const, label:'employee point records', count:pointCount } : null,
    publishedScheduleCount ? { key:'publishedSchedules' as const, label:'published schedule entries', count:publishedScheduleCount } : null,
    scheduleHistoryCount ? { key:'scheduleHistory' as const, label:'schedule history records', count:scheduleHistoryCount } : null,
  ].filter((item): item is EmployeeRemovalBlocker => Boolean(item))
}
