export type NotificationPriority = 'info' | 'success' | 'warning' | 'critical'

export interface NotificationItem {
  id: string
  title: string
  message?: string
  priority: NotificationPriority
  createdAt: string
  isRead: boolean
  orderNumber?: string
  target?: 'order' | 'finance_order_verification' | 'finance_payroll' | 'hr_attendance' | 'hr_reports' | 'hr_payroll' | 'my_schedule'
  targetId?: string
}
