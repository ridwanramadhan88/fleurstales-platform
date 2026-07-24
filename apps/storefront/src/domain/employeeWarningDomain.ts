import type { OrderTableRow } from '../types/orders'
import type { AttendanceReviewCase, Employee } from '../store/hrStoreTypes'
import { getOrderPriority, wasCompletedLate } from './orderTimingDomain'

/**
 * Creates stable HR review warnings from existing prototype order data.
 * No new operational workflow is introduced: the warning only asks HR to
 * review whether a late delivery should be closed or recorded as a Problem.
 */
export const buildDeliveryLateWarnings = (params: {
  orders: OrderTableRow[]
  employees: Employee[]
  existingCases: AttendanceReviewCase[]
  nowIso?: string
}): AttendanceReviewCase[] => {
  const existingIds = new Set(params.existingCases.map((item) => item.id))
  const employeeIds = new Set(params.employees.map((item) => item.id))
  const createdAt = params.nowIso ?? new Date().toISOString()

  return params.orders.flatMap((order) => {
    if (order.fulfillment !== 'delivery' || (getOrderPriority(order) !== 'late' && !wasCompletedLate(order))) return []
    const employeeId = order.adminHandledEmployeeId
    if (!employeeId || !employeeIds.has(employeeId)) return []

    const orderIdentity = order.id ?? order.orderNumber
    const id = `review-order-${orderIdentity}-delivery_late`
    if (existingIds.has(id)) return []

    return [{
      id,
      attendanceId: `order:${orderIdentity}`,
      sourceType: 'order' as const,
      sourceId: orderIdentity,
      orderNumber: order.orderNumber,
      employeeId,
      date: order.scheduleDate ?? order.completedAt?.slice(0, 10) ?? createdAt.slice(0, 10),
      warningType: 'delivery_late' as const,
      status: 'pending' as const,
      reason: 'Delivery passed the scheduled time.',
      scheduledBranchName: order.branch,
      actualTime: order.completedAt,
      createdAt,
    }]
  })
}
