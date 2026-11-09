import type { OrderTableRow } from '../types/orders'
import type { SaveOrderShipmentInput, SaveOrderShipmentResult } from './shared/contracts'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'

/**
 * Owner/Admin record how a delivery is sent (Gojek or internal courier), the
 * real cost and the Gojek tracking link (`save_order_shipment`). The server also
 * books, corrects or voids the matching Finance expense.
 */
export const saveOrderShipment = async (
  order: OrderTableRow,
  shipment: SaveOrderShipmentInput,
): Promise<SaveOrderShipmentResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  const result = await shared.repositories.ordersAdmin.saveOrderShipment(order.id, order.revision ?? 1, shipment)
  await refreshBusinessOsOrdersFromRemote().catch(() => false)
  return result
}
