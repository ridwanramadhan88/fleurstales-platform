import type { OrderTableRow } from '../types/orders'

export interface EmployeeOrderPerformance {
  floristAssigned: number
  floristCompleted: number
  floristProcessing: number
  adminStartedProcessing: number
}

const COMPLETED_ORDER_STATUSES = new Set<OrderTableRow['status']>(['delivered', 'picked_up'])

export const getEmployeeOrderPerformance = (
  employeeId: string,
  orders: OrderTableRow[],
): EmployeeOrderPerformance => {
  const floristOrders = orders.filter((order) => order.floristAssignedEmployeeId === employeeId)
  return {
    floristAssigned: floristOrders.length,
    floristCompleted: floristOrders.filter((order) => COMPLETED_ORDER_STATUSES.has(order.status)).length,
    floristProcessing: floristOrders.filter((order) => order.status === 'processing').length,
    adminStartedProcessing: orders.filter(
      (order) => order.adminHandledEmployeeId === employeeId && Boolean(order.processingStartedAt),
    ).length,
  }
}
