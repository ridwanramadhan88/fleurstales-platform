/**
 * @file eventService.ts
 * @description Orchestration layer for domain events:
 * - Stores call these helpers after raw mutations.
 * - This module applies domain logic (via pure domain functions).
 * - It emits normalized events over the eventBus for UI and other modules.
 *
 * Domain modules remain pure; they never import the event bus directly.
 */

import { eventBus } from './eventBus'
import type { OrderTableRow, OrderStatus } from '../../types/orders'
import type { StockItem, StockTransfer } from '../../store/stockStoreTypes'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import type { UserRole } from '../../store/userStore'
import {
  getOrderPriority,
  getOrderStatusGroup,
  getDisplayScheduleLabel,
  type OrderStatusGroup,
} from '../../domain/ordersDomain'
import {
  getStockAlerts,
  type StockAlertBuckets,
} from '../../domain/alertsDomain'
import type { AlertItem } from '../../domain/alertsDomain'

/**
 * @description Emits a typed event via the central bus.
 */
const emit = eventBus.emit

/**
 * @description Emits base order lifecycle events.
 */
export const emitOrderCreated = (order: OrderTableRow): void => {
  emit('order.created', { order })
}

export const emitOrderUpdated = (
  order: OrderTableRow,
  reason?: string,
): void => {
  emit('order.updated', { order, reason })
}

export const emitOrderStatusChanged = (
  order: OrderTableRow,
  previousStatus: OrderStatus,
  nextStatus: OrderStatus,
): void => {
  emit('order.status_changed', {
    order,
    previousStatus,
    nextStatus,
  })

  const previousGroup = getOrderStatusGroup({
    ...order,
    status: previousStatus,
  } as OrderTableRow)
  const nextGroup = getOrderStatusGroup(order)

  if (previousGroup !== nextGroup) {
    emit('order.status_group_changed', {
      order,
      previousGroup,
      nextGroup,
    })
  }
}

export const emitOrderAssigned = (
  order: OrderTableRow,
  previousFlorist: string | undefined,
  nextFlorist: string | undefined,
): void => {
  emit('order.assigned', {
    order,
    previousFlorist,
    nextFlorist,
  })
}

export const emitOrderDelivered = (order: OrderTableRow): void => {
  emit('order.delivered', { order })
}

/**
 * @description Converts order priority into low-level events and alerts.
 */
export const evaluateOrderPriorityAndEmitAlerts = (
  order: OrderTableRow,
): void => {
  const priority = getOrderPriority(order)
  const statusGroup: OrderStatusGroup = getOrderStatusGroup(order)

  if (priority === 'late') {
    emit('order.late', { order })

    const alert: AlertItem = {
      id: `alert-order-late-${order.orderNumber}`,
      kind: 'order_late',
      severity: 'critical',
      title: `Late · ${order.orderNumber}`,
      message: `${order.customerName} · ${getDisplayScheduleLabel(order) ?? 'Schedule not set'}`,
      branch: order.branch,
    }
    emit('alert.generated', { alert })
  } else if (priority === 'due_soon') {
    emit('order.due_soon', { order })

    const alert: AlertItem = {
      id: `alert-order-duesoon-${order.orderNumber}`,
      kind: 'order_due_soon',
      severity: 'warning',
      title: `Due soon · ${order.orderNumber}`,
      message: `${order.customerName} · ${getDisplayScheduleLabel(order) ?? 'Schedule not set'}`,
      branch: order.branch,
    }
    emit('alert.generated', { alert })
  }

  // Status group can be useful for dashboards; emit a mild refresh hint.
  emit('dashboard.refresh', {
    source: `order-status-group:${statusGroup}`,
  })
}

/**
 * @description Emits stock-related lifecycle events.
 */
export const emitStockUpdated = (
  item: StockItem,
  reason?: string,
): void => {
  emit('stock.updated', { item, reason })
}

export const emitStockTransferred = (transfer: StockTransfer): void => {
  emit('stock.transferred', { transfer })
}

/**
 * @description Emits a stock-deleted event. Only the id is carried (the item
 * itself no longer exists in state), mirroring 'order.deleted'.
 */
export const emitStockDeleted = (itemId: string): void => {
  emit('stock.deleted', { itemId })
}

/**
 * @description Processes stock items via the Alerts domain and emits low/expired
 * events plus alert.generated notifications.
 */
export const processStockAlertsAndEmit = (
  items: StockItem[],
): StockAlertBuckets => {
  const buckets = getStockAlerts(items)

  buckets.lowStock.forEach((item) => {
    emit('stock.low', { item })

    const alert: AlertItem = {
      id: `alert-stock-low-${item.id}`,
      kind: 'stock_low',
      severity: 'warning',
      title: `Low stock · ${item.name}`,
      message: `Available: ${item.availableQty} ${item.unit}`,
      branch: item.branch,
    }
    emit('alert.generated', { alert })
  })

  buckets.expiredStock.forEach((item) => {
    emit('stock.expired', { item })

    const alert: AlertItem = {
      id: `alert-stock-expired-${item.id}`,
      kind: 'stock_expired',
      severity: 'critical',
      title: `Expired stock · ${item.name}`,
      message: item.expiryDate
        ? `Expired on ${item.expiryDate}`
        : 'Expiry date passed',
      branch: item.branch,
    }
    emit('alert.generated', { alert })
  })

  return buckets
}

/**
 * @description Emits customer lifecycle events.
 */
export const emitCustomerCreated = (customer: CustomerProfile): void => {
  emit('customer.created', { customer })
}

export const emitCustomerUpdated = (customer: CustomerProfile): void => {
  emit('customer.updated', { customer })
}

/**
 * @description Emits a normalized alert-generated event so UI modules can
 * subscribe without needing to know source modules.
 */
export const emitAlertGenerated = (alert: AlertItem): void => {
  emit('alert.generated', { alert })
}

/**
 * @description Emits a user-updated event when the active user/role changes.
 */
export const emitUserUpdated = (params: {
  name: string
  role: UserRole
}): void => {
  emit('user.updated', {
    name: params.name,
    role: params.role,
  })
}

/**
 * @description Convenience helper to emit a dashboard-wide refresh hint.
 */
export const emitDashboardRefresh = (source: string): void => {
  emit('dashboard.refresh', { source })
}
