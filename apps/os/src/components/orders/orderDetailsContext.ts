import type { OrderStatus, OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import type { UiLanguage } from '../../i18n/uiLanguage'

export type OrderDetailContextTab = 'process' | 'production' | 'finance'

const ORDER_PROGRESS_STATUSES: OrderStatus[] = [
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'delivering',
]

const ADMIN_PROCESS_STATUSES: OrderStatus[] = [
  'confirmed',
  'processing',
  'ready',
  'delivering',
]

const FLORIST_PRODUCTION_STATUSES: OrderStatus[] = [
  'confirmed',
  'processing',
  'ready',
]

const ORDER_PROGRESS_ROLES: UserRole[] = ['owner', 'admin', 'finance', 'florist']

export const isOrderOperationallyActive = (status: OrderStatus): boolean =>
  ORDER_PROGRESS_STATUSES.includes(status)

export const shouldShowAdminLifecycle = (
  role: UserRole,
  status: OrderStatus,
): boolean => ORDER_PROGRESS_ROLES.includes(role) && isOrderOperationallyActive(status)

export const getOrderDetailContextTab = ({
  order,
  role,
  financeActionable,
}: {
  order: Pick<OrderTableRow, 'status'>
  role: UserRole
  financeActionable: boolean
}): OrderDetailContextTab | null => {
  // Before an order is confirmed, Order Details is the primary workspace.
  if (order.status === 'pending_verification') return null

  if (role === 'finance') return financeActionable ? 'finance' : null

  if (role === 'florist') {
    return FLORIST_PRODUCTION_STATUSES.includes(order.status) ? 'production' : null
  }

  if ((role === 'admin' || role === 'owner') && ADMIN_PROCESS_STATUSES.includes(order.status)) {
    return 'process'
  }

  return null
}

export const getOrderDetailContextLabel = (
  context: OrderDetailContextTab,
  language: UiLanguage,
): string => {
  if (language === 'id') {
    if (context === 'process') return 'Proses'
    if (context === 'production') return 'Produksi'
    return 'Keuangan'
  }

  if (context === 'process') return 'Process'
  if (context === 'production') return 'Production'
  return 'Finance'
}
