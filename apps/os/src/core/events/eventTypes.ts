/**
 * @file eventTypes.ts
 * @description Central type-safe event definitions for the Fleurstales OS.
 * All modules (stores, domain orchestration, UI) must use these event names
 * and payloads when emitting or subscribing to events via the event bus.
 */

import type { OrderTableRow, OrderStatus } from '../../types/orders'
import type { StockItem, StockTransfer } from '../../store/stockStoreTypes'
import type { CustomerProfile } from '../../store/customerStoreTypes'
import type {
  CustomerSegment,
} from '../../domain/customerDomain'
import type { AlertItem } from '../../domain/alertsDomain'
import type { OrderStatusGroup } from '../../domain/ordersDomain'

/**
 * @description All domain-level event names used across the system.
 */
export type DomainEventName =
  | 'order.created'
  | 'order.updated'
  | 'order.status_changed'
  | 'order.assigned'
  | 'order.delivered'
  | 'order.deleted'
  | 'order.late'
  | 'order.due_soon'
  | 'order.status_group_changed'
  | 'stock.updated'
  | 'stock.low'
  | 'stock.expired'
  | 'stock.transferred'
  | 'stock.deleted'
  | 'customer.created'
  | 'customer.updated'
  | 'customer.segment_changed'
  | 'customer.vip_detected'
  | 'user.updated'
  | 'alert.generated'
  | 'notification.created'
  | 'dashboard.refresh'

/**
 * @description Payload mapping for each domain event name.
 */
export interface DomainEventPayloads {
  'order.created': {
    order: OrderTableRow
  }
  'order.updated': {
    order: OrderTableRow
    /** Optional human-readable reason for the update. */
    reason?: string
  }
  'order.status_changed': {
    order: OrderTableRow
    previousStatus: OrderStatus
    nextStatus: OrderStatus
  }
  'order.assigned': {
    order: OrderTableRow
    previousFlorist?: string
    nextFlorist?: string
  }
  'order.delivered': {
    order: OrderTableRow
  }
  'order.deleted': {
    orderNumber: string
  }
  'order.late': {
    order: OrderTableRow
  }
  'order.due_soon': {
    order: OrderTableRow
  }
  'order.status_group_changed': {
    order: OrderTableRow
    previousGroup: OrderStatusGroup
    nextGroup: OrderStatusGroup
  }
  'stock.updated': {
    item: StockItem
    /** Optional audit reason. */
    reason?: string
  }
  'stock.low': {
    item: StockItem
  }
  'stock.expired': {
    item: StockItem
  }
  'stock.transferred': {
    transfer: StockTransfer
  }
  'stock.deleted': {
    itemId: string
  }
  'customer.created': {
    customer: CustomerProfile
  }
  'customer.updated': {
    customer: CustomerProfile
  }
  'customer.segment_changed': {
    customer: CustomerProfile
    previousSegment: CustomerSegment
    nextSegment: CustomerSegment
  }
  'customer.vip_detected': {
    customer: CustomerProfile
  }
  'user.updated': {
    name: string
    role: string
  }
  'alert.generated': {
    alert: AlertItem
  }
  'notification.created': {
    alert: AlertItem
  }
  'dashboard.refresh': {
    /** Free-form description of what triggered the refresh. */
    source: string
  }
}

/**
 * @description Convenience alias for the payload of a specific event.
 */
export type DomainEventPayload<E extends DomainEventName> =
  DomainEventPayloads[E]

/**
 * @description Handler signature for a specific domain event.
 */
export type DomainEventHandler<E extends DomainEventName> = (
  payload: DomainEventPayload<E>,
) => void
