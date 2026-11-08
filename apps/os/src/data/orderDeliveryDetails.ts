import type { OrderTableRow } from '../types/orders'
import type { SaveOrderDeliveryDetailsInput, SaveOrderDeliveryDetailsResult } from './shared/contracts'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'

/**
 * Owner/Admin correct a delivery's recipient, pin, landmark or address until
 * the order is finished (`save_order_delivery_details`).
 */
export const saveOrderDeliveryDetails = async (
  order: OrderTableRow,
  details: SaveOrderDeliveryDetailsInput,
): Promise<SaveOrderDeliveryDetailsResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  const result = await shared.repositories.ordersAdmin.saveOrderDeliveryDetails(order.id, order.revision ?? 1, details)
  await refreshBusinessOsOrdersFromRemote().catch(() => false)
  return result
}
