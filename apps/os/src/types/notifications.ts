export type NotificationPriority = 'info' | 'success' | 'warning' | 'critical'

export interface NotificationItem {
  id: string
  title: string
  message?: string
  priority: NotificationPriority
  createdAt: string
  isRead: boolean
  orderNumber?: string
  target?: 'order' | 'finance_orders' | 'hr_attendance' | 'hr_reports' | 'my_schedule'
  targetId?: string
}
