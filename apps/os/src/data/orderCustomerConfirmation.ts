import type { OrderTableRow } from '../types/orders'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'

const STOREFRONT_ORIGIN = 'https://fleurstales-storefront.vercel.app'

export const getStorefrontOrigin = (): string => STOREFRONT_ORIGIN

export const buildOrderTrackingUrl = (publicTrackingId: string): string =>
  `${getStorefrontOrigin()}/order/${encodeURIComponent(publicTrackingId)}`

export const buildOrderConfirmedMessage = (order: OrderTableRow, trackingUrl: string): string =>
  `Hi kak ${order.customerName}, pesanan ${order.orderNumber} sudah kami konfirmasi dan akan segera diproses. Status pesanan bisa dicek di ${trackingUrl}`

export const buildOrderCancelledMessage = (
  order: OrderTableRow,
  reason: string,
  trackingUrl: string,
): string =>
  `Hi kak ${order.customerName}, maaf pesanan ${order.orderNumber} belum dapat kami proses dan dibatalkan. Alasan: ${reason}. Status pesanan: ${trackingUrl}`

export interface StorefrontOrderCommandResult {
  orderId: string
  orderNumber: string
  revision: number
  status: 'confirmed' | 'cancelled'
  publicTrackingId: string
  cancellationReason?: string
  updatedAt: string
}

export interface FinanceReferenceCommandResult {
  orderId: string
  orderNumber: string
  revision: number
  financeReferenceCode?: string
  updatedAt: string
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

const refreshAfterCommand = async (): Promise<void> => {
  const refreshed = await refreshBusinessOsOrdersFromRemote()
  if (!refreshed) throw new Error('The change was saved, but the latest order could not be reloaded.')
}

export const confirmPendingStorefrontOrder = async (
  order: OrderTableRow,
): Promise<StorefrontOrderCommandResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  const result = await getClient().rpc<StorefrontOrderCommandResult>('confirm_pending_storefront_order', {
    p_order_id: order.id,
    p_expected_revision: order.revision ?? 1,
  })
  await refreshAfterCommand()
  return result
}

export const cancelPendingStorefrontOrder = async (
  order: OrderTableRow,
  reason: string,
): Promise<StorefrontOrderCommandResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  const result = await getClient().rpc<StorefrontOrderCommandResult>('cancel_pending_storefront_order', {
    p_order_id: order.id,
    p_expected_revision: order.revision ?? 1,
    p_reason: reason.trim(),
  })
  await refreshAfterCommand()
  return result
}

export const saveOrderFinanceReference = async (
  order: OrderTableRow,
  reference: string,
): Promise<FinanceReferenceCommandResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  const result = await getClient().rpc<FinanceReferenceCommandResult>('save_order_finance_reference', {
    p_order_id: order.id,
    p_expected_revision: order.revision ?? 1,
    p_reference: reference.trim(),
  })
  await refreshAfterCommand()
  return result
}
