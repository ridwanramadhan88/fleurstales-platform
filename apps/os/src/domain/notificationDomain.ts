import type { AlertItem, AlertKind } from './alertsDomain'
import type { UserRole } from '../store/userStore'
import type { BranchFilter } from '../types/orders'

const NOTIFICATION_WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface NotificationRecord extends AlertItem {
  createdAt: string
}

const ROLE_ALERT_KINDS: Record<UserRole, readonly AlertKind[]> = {
  owner: ['hr_attendance_problem', 'order_change_requested', 'order_change_resolved', 'payroll_submitted', 'payroll_rejected', 'payroll_approved', 'payroll_paid', 'authorization_changed'],
  admin: ['finance_rejected', 'schedule_published', 'order_received', 'order_change_resolved', 'authorization_changed'],
  finance: ['admin_resubmitted', 'order_pending_verification', 'order_change_requested', 'payroll_submitted', 'authorization_changed'],
  hr: ['hr_attendance_problem', 'payroll_rejected', 'payroll_approved', 'payroll_paid', 'authorization_changed'],
  florist: ['schedule_published', 'order_assigned', 'authorization_changed'],
}

const isNotificationRelevantToRole = (
  notification: Pick<NotificationRecord, 'kind'>,
  role: UserRole,
): boolean => ROLE_ALERT_KINDS[role].includes(notification.kind)

const isNotificationWithinWindow = (
  notification: Pick<NotificationRecord, 'createdAt'>,
  now = new Date(),
): boolean => {
  const createdAt = new Date(notification.createdAt).getTime()
  if (!Number.isFinite(createdAt)) return false
  const age = now.getTime() - createdAt
  return age >= 0 && age <= NOTIFICATION_WINDOW_DAYS * DAY_MS
}

export const getVisibleNotifications = ({
  notifications,
  role,
  branch,
  now = new Date(),
}: {
  notifications: NotificationRecord[]
  role: UserRole
  branch: BranchFilter
  now?: Date
}): NotificationRecord[] =>
  notifications
    .filter((notification) => isNotificationWithinWindow(notification, now))
    .filter((notification) => isNotificationRelevantToRole(notification, role))
    .filter(
      (notification) =>
        role === 'admin' ||
        branch === 'All' ||
        !notification.branch ||
        notification.branch === branch,
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
