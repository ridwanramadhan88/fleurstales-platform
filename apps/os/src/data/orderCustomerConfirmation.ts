import type { OrderTableRow } from '../types/orders'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'

const STOREFRONT_ORIGIN = 'https://fleurstales-storefront.vercel.app'

export const getStorefrontOrigin = (): string => STOREFRONT_ORIGIN

/**
 * Moments at which a tracking link is (re-)sent to the customer. Each is
 * appended as `&v=<moment>` — a distinct value per moment, and every send at
 * the same moment reuses that same value. To WhatsApp's link-preview
 * crawler, only a *new* `v` value looks like a new URL (bypassing its
 * ~week-long per-URL preview cache); a link resent unchanged still shows the
 * dedicated inline preview instead of the destination just spamming plain
 * text, since no host serves an og:image for a URL WhatsApp never
 * (re-)crawled.
 */
export type OrderTrackingMoment = 'confirmed' | 'ready' | 'finished'

/**
 * Canonical customer-facing tracking link. `/order/:trackingId` is
 * deprecated — this is the only shape sent to customers going forward.
 */
export const buildOrderTrackingUrl = (
  orderNumber: string,
  publicTrackingId: string,
  moment: OrderTrackingMoment,
): string =>
  `${getStorefrontOrigin()}/track/${encodeURIComponent(orderNumber)}?key=${encodeURIComponent(publicTrackingId)}&v=${moment}`

const getOrderProductSummary = (order: OrderTableRow): string => {
  const items = order.items ?? []
  if (items.length === 0) return order.productName ?? order.productId ?? 'Pesanan bunga'

  const first = items[0]
  const firstName = first.productNameSnapshot
    ?? first.productName
    ?? order.productName
    ?? first.productId
    ?? 'Pesanan bunga'

  return items.length > 1 ? `${firstName} +${items.length - 1} item` : firstName
}

export const buildOrderConfirmedMessage = (order: OrderTableRow, trackingUrl: string): string =>
  [
    `Hi kak ${order.customerName},`,
    '',
    `Pesanan: ${getOrderProductSummary(order)}`,
    `No Pesanan: ${order.orderNumber}`,
    'sudah kami konfirmasi',
    '',
    'Segera lakukan pembayaran',
    '',
    'Status pesanan bisa dicek di',
    trackingUrl,
  ].join('\n')

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

/** Staff-side lookup of an order's tracking key, for previewing the
 * customer-facing link before a confirm/reject decision is actually sent. */
export const getOrderTrackingId = async (orderId: string): Promise<string> => {
  const result = await getClient().rpc<string | null>('get_order_tracking_id', { p_order_id: orderId })
  if (!result) throw new Error('This order does not have a tracking link yet.')
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