import { bootstrapSharedData } from './shared/bootstrap'
import type { OrderFulfillment, OrderStatus, PaymentMethod, PaymentStatus } from './shared/databaseTypes'

export interface PublicOrderTrackingItem {
  name: string
  variant?: string | null
  quantity: number
  unitPriceIdr: number
}

export interface PublicOrderTrackingDetails {
  orderNumber: string
  status: OrderStatus
  fulfillment: OrderFulfillment
  branchId: string
  branchName?: string | null
  branchAddress?: string | null
  customerName: string
  customerWhatsapp?: string | null
  deliveryAddress?: string | null
  deliveryInstructions?: string | null
  scheduleDate?: string | null
  scheduleTime?: string | null
  requestedPickupDate?: string | null
  requestedPickupTime?: string | null
  paymentStatus: PaymentStatus
  paymentMethod?: PaymentMethod | null
  itemsSubtotalIdr: number
  deliveryFeeIdr: number
  discountIdr: number
  totalIdr: number
  cancellationReason?: string | null
  items: PublicOrderTrackingItem[]
}

export interface PublicOrderStatusSummary {
  orderNumber: string
  status: OrderStatus
  fulfillment: OrderFulfillment
  branchName?: string | null
  scheduleDate?: string | null
  scheduleTime?: string | null
  requestedPickupDate?: string | null
  requestedPickupTime?: string | null
}

const getPublicClient = () => {
  const shared = bootstrapSharedData()
  if (!shared.enabled) throw new Error('Order tracking is unavailable right now.')
  return shared.repositories.client
}

export const getPublicOrderTracking = async (trackingId: string): Promise<PublicOrderTrackingDetails | null> =>
  getPublicClient().rpc<PublicOrderTrackingDetails | null>('get_order_public_status', {
    p_tracking_id: trackingId,
  })

export const searchPublicOrderStatus = async (orderNumber: string): Promise<PublicOrderStatusSummary | null> =>
  getPublicClient().rpc<PublicOrderStatusSummary | null>('search_order_public_status', {
    p_order_number: orderNumber.trim(),
  })
