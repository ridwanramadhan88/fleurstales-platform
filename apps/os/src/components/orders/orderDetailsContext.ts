import type { OrderStatus, OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'

export type OrderDetailContextTab = 'process' | 'production' | 'finance'

const ADMIN_ACTIVE_STATUSES: OrderStatus[] = [
  'pending_verification',
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

export const isOrderOperationallyActive = (status: OrderStatus): boolean =>
  ADMIN_ACTIVE_STATUSES.includes(status)

export const shouldShowAdminLifecycle = (
  role: UserRole,
  status: OrderStatus,
): boolean => role === 'admin' && isOrderOperationallyActive(status)

export const getOrderDetailContextTab = ({
  order,
  role,
  financeActionable,
}: {
  order: Pick<OrderTableRow, 'status'>
  role: UserRole
  financeActionable: boolean
}): OrderDetailContextTab | null => {
  if (role === 'finance') return financeActionable ? 'finance' : null

  if (role === 'florist') {
    return FLORIST_PRODUCTION_STATUSES.includes(order.status) ? 'production' : null
  }

  if ((role === 'admin' || role === 'owner') && isOrderOperationallyActive(order.status)) {
    return 'process'
  }

  return null
}

export const getOrderDetailContextLabel = (context: OrderDetailContextTab): string => {
  if (context === 'process') return 'Process'
  if (context === 'production') return 'Production'
  return 'Finance'
}
