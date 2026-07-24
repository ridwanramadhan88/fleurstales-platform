/**
 * @file alertsDomain.ts
 * @description Domain layer for cross-module alerts (Orders, Stock, HR).
 * Contains only pure functions that:
 * - Classify orders into late / due soon / normal using Orders domain.
 * - Derive low-stock and expired-stock alerts using Stock domain.
 * - Aggregate system-wide alerts based on role and branch.
 *
 * No UI logic and no store mutations are allowed here.
 */

import type { BranchId, OrderTableRow } from '../types/orders'
import type { StockItem } from '../store/stockStoreTypes'
import type { UserRole } from '../store/userStore'
import type { AttendanceRecord, AttendanceReviewCase, Employee, ScheduleRevision, WeeklySchedulePublication } from '../store/hrStoreTypes'
import type { PayrollScheduleAdjustmentRecord } from '../store/payrollStore'
import { getOrderPriority } from './ordersDomain'
import { getLowStockItems, getExpiredStock } from './stockDomain'

/**
 * @description Severity buckets for alerts.
 */
export type AlertSeverity = 'critical' | 'warning' | 'info'

/**
 * @description Normalised alert kind identifiers used across modules.
 */
export type AlertKind =
  | 'order_late'
  | 'order_due_soon'
  | 'order_pending_verification'
  | 'payment_issue'
  | 'stock_low'
  | 'stock_expired'
  | 'hr_absence'
  | 'hr_birthday'
  | 'hr_schedule_warning'
  | 'finance_rejected'
  | 'admin_resubmitted'
  | 'hr_attendance_problem'
  | 'schedule_published'

/**
 * @description Single alert item used by UI components.
 * UI should treat this as a business event and only render title/message.
 */
export interface AlertItem {
  /** Stable id for React rendering. */
  id: string
  /** Short human-readable title. */
  title: string
  /** Optional supporting message. */
  message?: string
  /** Severity bucket. */
  severity: AlertSeverity
  /** Normalised alert kind. */
  kind: AlertKind
  /** Branch associated with this alert; omitted for cross-branch/HR alerts. */
  branch?: BranchId
  /** Order number this alert refers to, when applicable. */
  orderNumber?: string
  /** Destination opened when the notification is selected. */
  target?: 'order' | 'finance_orders' | 'hr_attendance' | 'hr_reports' | 'my_schedule'
  /** Optional record identifier for the destination. */
  targetId?: string
}

/**
 * @description Buckets for time-based order alerts.
 */
export interface OrderAlertBuckets {
  /** Orders considered late (deadline passed). */
  late: OrderTableRow[]
  /** Orders considered at risk / due soon (within the next time window). */
  dueSoon: OrderTableRow[]
}

/**
 * @description Buckets for stock-based alerts.
 */
export interface StockAlertBuckets {
  /** Items where available quantity is at/below threshold. */
  lowStock: StockItem[]
  /** Items that are already expired. */
  expiredStock: StockItem[]
}

/**
 * @description Derives time-based alert buckets for a list of orders using Orders domain priority.
 * - late: getOrderPriority(order) === 'late'
 * - dueSoon: getOrderPriority(order) === 'due_soon'
 * - normal orders are ignored here.
 */
export const getOrderAlerts = (orders: OrderTableRow[]): OrderAlertBuckets => {
  const late: OrderTableRow[] = []
  const dueSoon: OrderTableRow[] = []

  orders.forEach((order) => {
    const priority = getOrderPriority(order)
    if (priority === 'late') {
      late.push(order)
    } else if (priority === 'due_soon') {
      dueSoon.push(order)
    }
  })

  return { late, dueSoon }
}

/**
 * @description Derives low-stock and expired-stock alert buckets from stock items.
 * Uses stockDomain helpers for low-stock and expiry detection.
 */
export const getStockAlerts = (items: StockItem[]): StockAlertBuckets => {
  const lowStock = getLowStockItems(items)
  const expiredStock = getExpiredStock(items)

  return {
    lowStock,
    expiredStock,
  }
}

/**
 * @description Input context for aggregating system alerts.
 */
export interface SystemAlertsContext {
  /** All orders known to the system (raw rows). */
  orders: OrderTableRow[]
  /** All stock items known to the system. */
  stockItems: StockItem[]
  /** Optional branch filter for branch-scoped alerts. */
  branch?: BranchId | 'All'
  /** Current user role to adapt which alerts are relevant. */
  role: UserRole
  attendance?: AttendanceRecord[]
  attendanceReviewCases?: AttendanceReviewCase[]
  employees?: Employee[]
  payrollAdjustments?: PayrollScheduleAdjustmentRecord[]
  scheduleRevisions?: ScheduleRevision[]
  schedulePublications?: WeeklySchedulePublication[]
  currentEmployeeId?: string
}

/**
 * @description Aggregates cross-module alerts (orders + stock + HR/system)
 * into a single flat list of AlertItems.
 *
 * Rules:
 * - HR role: returns HR-specific alerts only.
 * - Other roles: combine order alerts and stock alerts using the same
 *   business rules as Orders and Stock domains.
 *
 * The function is pure and never mutates store or UI state.
 */
export const getSystemAlerts = (context: SystemAlertsContext): AlertItem[] => {
  const {
    orders,
    branch,
    role,
    attendanceReviewCases = [],
    employees = [],
    schedulePublications = [],
    currentEmployeeId,
  } = context

  if (role === 'owner') {
    const verification = orders
      .filter((order) => !order.financeVerified)
      .filter((order) => !branch || branch === 'All' || order.branch === branch)
      .map((order) => ({
        id: `owner-verification-${order.orderNumber}`,
        kind: 'order_pending_verification' as const,
        severity: 'warning' as const,
        title: `${order.orderNumber} needs verification`,
        message: `${order.customerName} · Finance review pending`,
        branch: order.branch,
        orderNumber: order.orderNumber,
        target: 'finance_orders' as const,
      }))

    const attendanceProblems = attendanceReviewCases
      .filter((item) => item.status === 'pending')
      .map((item) => {
        const employee = employees.find((entry) => entry.id === item.employeeId)
        return {
          id: `owner-hr-problem-${item.id}`,
          kind: 'hr_attendance_problem' as const,
          severity: 'warning' as const,
          title: `${employee?.name ?? 'Employee'} needs attendance review`,
          message: item.reason,
          branch: item.scheduledBranchId,
          target: 'hr_attendance' as const,
          targetId: item.id,
        }
      })

    return [...verification, ...attendanceProblems]
  }

  if (role === 'admin') {
    const rejected = orders
      .filter((order) => order.financeVerificationStatus === 'rejected')
      .filter((order) => !branch || branch === 'All' || order.branch === branch)
      .map((order) => ({
        id: `finance-rejected-${order.orderNumber}-${order.financeVerificationAt ?? 'current'}`,
        kind: 'finance_rejected' as const,
        severity: 'warning' as const,
        title: `Finance rejected ${order.orderNumber}`,
        message: `${order.customerName} · ${order.financeVerificationNote || 'Correction required'}`,
        branch: order.branch,
        orderNumber: order.orderNumber,
        target: 'order' as const,
      }))

    const schedule = currentEmployeeId
      ? schedulePublications
          .slice()
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 1)
          .map((item) => ({
            id: `schedule-published-${item.id}-${item.updatedAt}`,
            kind: 'schedule_published' as const,
            severity: 'info' as const,
            title: 'New schedule published',
            message: `Week of ${item.weekStart} · View your assignment`,
            target: 'my_schedule' as const,
          }))
      : []

    return [...rejected, ...schedule]
  }

  if (role === 'finance') {
    return orders
      .filter((order) => Boolean(order.financeResubmittedAt) && !order.financeVerified)
      .filter((order) => !branch || branch === 'All' || order.branch === branch)
      .map((order) => ({
        id: `admin-resubmitted-${order.orderNumber}-${order.financeResubmittedAt}`,
        kind: 'admin_resubmitted' as const,
        severity: 'warning' as const,
        title: `Order resubmitted ${order.orderNumber}`,
        message: `${order.customerName} · Ready for Finance review`,
        branch: order.branch,
        orderNumber: order.orderNumber,
        target: 'finance_orders' as const,
      }))
  }

  if (role === 'hr') {
    const attendanceProblems = attendanceReviewCases
      .filter((item) => item.status === 'problem')
      .map((item) => {
        const employee = employees.find((entry) => entry.id === item.employeeId)
        return {
          id: `hr-problem-${item.id}`,
          kind: 'hr_attendance_problem' as const,
          severity: 'warning' as const,
          title: `${employee?.name ?? 'Employee'} has an open problem`,
          message: item.reason,
          branch: item.scheduledBranchId,
          target: 'hr_reports' as const,
          targetId: item.id,
        }
      })
    const financeProblems = orders
      .filter((order) => order.financeVerificationStatus === 'rejected')
      .map((order) => ({
        id: `hr-finance-problem-${order.orderNumber}-${order.financeVerificationAt ?? 'current'}`,
        kind: 'hr_attendance_problem' as const,
        severity: 'warning' as const,
        title: `Finance rejected ${order.orderNumber}`,
        message: order.financeVerificationNote || 'Correction is required.',
        branch: order.branch,
        orderNumber: order.orderNumber,
        target: 'hr_reports' as const,
        targetId: order.id,
      }))
    return [...attendanceProblems, ...financeProblems]
  }

  if (role === 'florist' && currentEmployeeId) {
    return schedulePublications
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 1)
      .map((item) => ({
        id: `schedule-published-${item.id}-${item.updatedAt}`,
        kind: 'schedule_published' as const,
        severity: 'info' as const,
        title: 'New schedule published',
        message: `Week of ${item.weekStart} · View your assignment`,
        target: 'my_schedule' as const,
      }))
  }

  return []
}
