import type { OrderTableRow } from '../types/orders'
import type { Employee, EmployeeDefaultSchedule, ScheduleOverride } from '../store/hrStoreTypes'
import type { OwnerSettingsStateValue } from '../types/settings'
import { getEffectiveScheduleForDate } from './hrSchedulingDomain'
import { getLocalDateString, nowInJakarta } from './orderTimingDomain'

export type FloristScheduleStatus =
  | 'scheduled'
  | 'different_branch'
  | 'outside_shift'
  | 'off'
  | 'wfh'
  | 'unassigned'

export interface FloristAssignmentOption {
  employeeId: string
  name: string
  scheduleStatus: FloristScheduleStatus
  scheduleReason: string
  branchId?: string
  shiftStart?: string
  shiftEnd?: string
  assignedProcessingOrders: number
  isRecommended: boolean
}

const toMinutes = (value: string): number => {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export const resolveFloristAssignmentMoment = (
  order: Pick<OrderTableRow, 'scheduleDate' | 'scheduleTime'>,
  now = nowInJakarta(),
): { date: string; time?: string; source: 'scheduled' | 'current' | 'date_only' } => {
  if (order.scheduleDate && order.scheduleTime) {
    return { date: order.scheduleDate, time: order.scheduleTime, source: 'scheduled' }
  }
  if (order.scheduleDate) return { date: order.scheduleDate, source: 'date_only' }
  return {
    date: getLocalDateString(now),
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    source: 'current',
  }
}

const getWorkload = ({
  employeeId,
  date,
  orders,
}: {
  employeeId: string
  date: string
  orders: OrderTableRow[]
}): number => orders.filter((order) =>
  order.status === 'processing' &&
  order.floristAssignedEmployeeId === employeeId &&
  (order.floristAssignedForDate ?? resolveFloristAssignmentMoment(order).date) === date
).length

export const getFloristAssignmentOptionsForOrder = (params: {
  order: Pick<OrderTableRow, 'branch' | 'scheduleDate' | 'scheduleTime'>
  employees: Employee[]
  defaults: EmployeeDefaultSchedule[]
  overrides: ScheduleOverride[]
  settings: Pick<OwnerSettingsStateValue, 'scheduling' | 'branches'>
  orders: OrderTableRow[]
  now?: Date
}): FloristAssignmentOption[] => {
  const moment = resolveFloristAssignmentMoment(params.order, params.now)
  const assignmentMinute = moment.time ? toMinutes(moment.time) : null

  return params.employees
    .filter((employee) => employee.status === 'active' && employee.systemRole === 'florist')
    .map((employee): FloristAssignmentOption => {
      const effective = getEffectiveScheduleForDate({
        employee,
        date: moment.date,
        defaults: params.defaults,
        overrides: params.overrides,
        settings: params.settings,
      })
      const explicitOverride = params.overrides.find((item) => item.employeeId === employee.id && item.date === moment.date)
      const isWfh = !effective.shift.isWorking && explicitOverride?.workMode === 'wfh'
      const workload = getWorkload({ employeeId: employee.id, date: moment.date, orders: params.orders })

      if (!effective.shift.isWorking) {
        const unassigned = effective.source === 'company_default'
        return {
          employeeId: employee.id,
          name: employee.name,
          scheduleStatus: isWfh ? 'wfh' : unassigned ? 'unassigned' : 'off',
          scheduleReason: isWfh ? 'WFH on this date.' : unassigned ? 'No schedule is assigned for this date.' : 'OFF on this date.',
          assignedProcessingOrders: workload,
          isRecommended: false,
        }
      }

      if (effective.shift.branchId !== params.order.branch) {
        return {
          employeeId: employee.id,
          name: employee.name,
          scheduleStatus: 'different_branch',
          scheduleReason: `Scheduled at ${effective.shift.branchId}, not ${params.order.branch}.`,
          branchId: effective.shift.branchId,
          shiftStart: effective.shift.startTime,
          shiftEnd: effective.shift.endTime,
          assignedProcessingOrders: workload,
          isRecommended: false,
        }
      }

      if (
        assignmentMinute !== null &&
        (assignmentMinute < toMinutes(effective.shift.startTime) || assignmentMinute > toMinutes(effective.shift.endTime))
      ) {
        return {
          employeeId: employee.id,
          name: employee.name,
          scheduleStatus: 'outside_shift',
          scheduleReason: `Shift ${effective.shift.startTime}-${effective.shift.endTime} does not cover the order time.`,
          branchId: effective.shift.branchId,
          shiftStart: effective.shift.startTime,
          shiftEnd: effective.shift.endTime,
          assignedProcessingOrders: workload,
          isRecommended: false,
        }
      }

      return {
        employeeId: employee.id,
        name: employee.name,
        scheduleStatus: 'scheduled',
        scheduleReason: 'Scheduled at this branch for the order time.',
        branchId: effective.shift.branchId,
        shiftStart: effective.shift.startTime,
        shiftEnd: effective.shift.endTime,
        assignedProcessingOrders: workload,
        isRecommended: true,
      }
    })
    .sort((a, b) =>
      Number(b.isRecommended) - Number(a.isRecommended) ||
      a.assignedProcessingOrders - b.assignedProcessingOrders ||
      (a.shiftStart ?? '99:99').localeCompare(b.shiftStart ?? '99:99') ||
      a.name.localeCompare(b.name),
    )
}

export const getFloristAssignmentOptionById = (
  params: Parameters<typeof getFloristAssignmentOptionsForOrder>[0],
  employeeId: string,
): FloristAssignmentOption | undefined =>
  getFloristAssignmentOptionsForOrder(params).find((florist) => florist.employeeId === employeeId)
