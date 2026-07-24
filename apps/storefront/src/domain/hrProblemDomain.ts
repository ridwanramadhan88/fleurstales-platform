import type { AttendanceReviewCase, Employee } from '../store/hrStoreTypes'
import type { OrderTableRow } from '../types/orders'

export type HrProblemSource = 'attendance' | 'orders' | 'finance' | 'scheduling'
export type HrProblemSeverity = 'warning' | 'critical'
export type HrProblemStatus = 'open' | 'under_review' | 'solved'

/**
 * Attendance cases own their own lifecycle. The standalone HR problem-review
 * store only supplies status for problems that have no authoritative source
 * record, such as Finance rejections and late fulfillment.
 */
export const getHrProblemStatus = (problem: Pick<HrProblemRecord, 'source'>, standaloneStatus?: HrProblemStatus): HrProblemStatus =>
  problem.source === 'attendance' ? 'open' : standaloneStatus ?? 'open'

export interface HrProblemRecord {
  id: string
  type: string
  source: HrProblemSource
  employeeId: string
  employeeName: string
  employeeRole: string
  branchId?: string
  relatedOrderId?: string
  relatedOrderNumber?: string
  relatedAttendanceId?: string
  title: string
  description: string
  severity: HrProblemSeverity
  createdAt: string
}

const employeeForOrder = (order: OrderTableRow, employees: Employee[]) => {
  const id = order.adminHandledEmployeeId ?? order.floristAssignedEmployeeId
  return id ? employees.find((employee) => employee.id === id) : undefined
}

const isLateCompletion = (order: OrderTableRow) => {
  if (!order.completedAt || !order.scheduleDate || !order.scheduleTime) return false
  const expected = new Date(`${order.scheduleDate}T${order.scheduleTime}:00+07:00`).getTime()
  return Number.isFinite(expected) && new Date(order.completedAt).getTime() > expected
}

export const buildHrProblems = ({
  employees,
  attendanceCases,
  orders,
}: {
  employees: Employee[]
  attendanceCases: AttendanceReviewCase[]
  orders: OrderTableRow[]
}): HrProblemRecord[] => {
  const attendanceProblems = attendanceCases
    .filter((item) => item.status === 'problem')
    .map((item) => {
      const employee = employees.find((candidate) => candidate.id === item.employeeId)
      return {
        id: `attendance:${item.id}`,
        type: item.warningType,
        source: 'attendance' as const,
        employeeId: item.employeeId,
        employeeName: employee?.name ?? 'Unknown employee',
        employeeRole: employee?.systemRole ?? 'staff',
        branchId: item.detectedBranchId ?? item.scheduledBranchId,
        relatedAttendanceId: item.attendanceId,
        relatedOrderNumber: item.orderNumber,
        title: item.warningType.replaceAll('_', ' '),
        description: item.reason,
        severity: item.warningType === 'missing_check_in' || item.warningType === 'missing_check_out' ? 'critical' as const : 'warning' as const,
        createdAt: item.createdAt,
      }
    })

  const orderProblems = orders.flatMap((order) => {
    const employee = employeeForOrder(order, employees)
    if (!employee || !['admin', 'florist'].includes(employee.systemRole)) return []
    const result: HrProblemRecord[] = []
    if (order.financeVerificationStatus === 'rejected') {
      result.push({
        id: `finance:${order.id}:${order.financeVerificationAt ?? 'rejected'}`,
        type: 'finance_rejected',
        source: 'finance',
        employeeId: employee.id,
        employeeName: employee.name,
        employeeRole: employee.systemRole,
        branchId: order.branch,
        relatedOrderId: order.id,
        relatedOrderNumber: order.orderNumber,
        title: 'Order rejected by Finance',
        description: order.financeVerificationNote || 'Finance returned this order for correction.',
        severity: 'critical',
        createdAt: order.financeVerificationAt ?? order.completedAt ?? new Date().toISOString(),
      })
    }
    if (isLateCompletion(order)) {
      result.push({
        id: `order-late:${order.id}`,
        type: 'late_fulfillment',
        source: 'orders',
        employeeId: employee.id,
        employeeName: employee.name,
        employeeRole: employee.systemRole,
        branchId: order.branch,
        relatedOrderId: order.id,
        relatedOrderNumber: order.orderNumber,
        title: 'Order completed late',
        description: `Completed after the requested ${order.fulfillment} time.`,
        severity: 'warning',
        createdAt: order.completedAt!,
      })
    }
    return result
  })

  return [...attendanceProblems, ...orderProblems]
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
