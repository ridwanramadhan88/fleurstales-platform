import type { OrderStatus, OrderTableRow } from '../../types/orders'
import type { UserRole } from '../../store/userStore'
import type { UiLanguage } from '../../i18n/uiLanguage'

export type OrderDetailContextTab = 'finance'

const ORDER_PROGRESS_STATUSES: OrderStatus[] = [
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'delivering',
]

const FINISHED_ORDER_STATUSES: OrderStatus[] = ['delivered', 'picked_up']
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
  // Active operational work stays in Details + the sticky stage action.
  // A contextual tab is reserved for exceptional Finance work after the
  // operational order has already finished.
  if (
    role === 'finance'
    && financeActionable
    && FINISHED_ORDER_STATUSES.includes(order.status)
  ) {
    return 'finance'
  }

  return null
}

export const getOrderDetailContextLabel = (
  _context: OrderDetailContextTab,
  language: UiLanguage,
): string => language === 'id' ? 'Keuangan' : 'Finance'
