import type { AlertItem, AlertKind } from './alertsDomain'
import type { UserRole } from '../store/userStore'
import type { BranchFilter } from '../types/orders'

const NOTIFICATION_WINDOW_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

export interface NotificationRecord extends AlertItem {
  createdAt: string
}

const ROLE_ALERT_KINDS: Record<UserRole, readonly AlertKind[]> = {
  owner: ['order_pending_verification', 'hr_attendance_problem'],
  admin: ['finance_rejected', 'schedule_published'],
  finance: ['admin_resubmitted'],
  hr: ['hr_attendance_problem'],
  florist: ['schedule_published'],
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
        branch === 'All' ||
        !notification.branch ||
        notification.branch === branch,
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    )
