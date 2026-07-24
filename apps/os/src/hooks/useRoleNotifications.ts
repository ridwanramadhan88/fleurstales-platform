import { useEffect, useMemo } from 'react'
import { getSystemAlerts } from '../domain/alertsDomain'
import { getVisibleNotifications } from '../domain/notificationDomain'
import { useNotificationStore } from '../store/notificationStore'
import { useOrdersStore } from '../store/ordersStore'
import { useStockStore } from '../store/stockStore'
import { useUserStore } from '../store/userStore'
import { useHrStore } from '../store/hrStore'
import { usePayrollStore } from '../store/payrollStore'
import type { BranchFilter } from '../types/orders'
import type { NotificationItem } from '../types/notifications'

export const useRoleNotifications = (activeBranch: BranchFilter) => {
  const role = useUserStore((state) => state.role)
  const employeeId = useUserStore((state) => state.employeeId)
  const orders = useOrdersStore((state) => state.orders)
  const stockItems = useStockStore((state) => state.items)
  const attendance = useHrStore((state) => state.attendance)
  const attendanceReviewCases = useHrStore((state) => state.attendanceReviewCases)
  const employees = useHrStore((state) => state.employees)
  const payrollAdjustments = usePayrollStore((state) => state.payrollScheduleAdjustments)
  const scheduleRevisions = useHrStore((state) => state.scheduleRevisions)
  const schedulePublications = useHrStore((state) => state.weeklySchedulePublications)
  const notifications = useNotificationStore((state) => state.notifications)
  const readIds = useNotificationStore((state) => state.readIds)
  const syncAlerts = useNotificationStore((state) => state.syncAlerts)
  const markRead = useNotificationStore((state) => state.markRead)

  const alerts = useMemo(
    () =>
      getSystemAlerts({
        orders,
        stockItems,
        branch: activeBranch,
        role,
        attendance,
        attendanceReviewCases,
        employees,
        payrollAdjustments,
        scheduleRevisions,
        schedulePublications,
        currentEmployeeId: employeeId,
      }),
    [activeBranch, attendance, attendanceReviewCases, employeeId, employees, orders, payrollAdjustments, role, schedulePublications, scheduleRevisions, stockItems],
  )

  useEffect(() => {
    syncAlerts(alerts)
  }, [alerts, syncAlerts])

  const visible = useMemo(
    () =>
      getVisibleNotifications({
        notifications,
        role,
        branch: activeBranch,
      }),
    [activeBranch, notifications, role],
  )
  const readSet = useMemo(() => new Set(readIds), [readIds])

  const items: NotificationItem[] = visible.map((notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    priority:
      notification.severity === 'critical'
        ? 'critical'
        : notification.severity,
    createdAt: notification.createdAt,
    isRead: readSet.has(notification.id),
    orderNumber: notification.orderNumber,
    target: notification.target,
    targetId: notification.targetId,
  }))

  return {
    items,
    unreadCount: items.filter((item) => !item.isRead).length,
    markAllRead: () => markRead(items.map((item) => item.id)),
    markRead: (id: string) => markRead([id]),
  }
}
