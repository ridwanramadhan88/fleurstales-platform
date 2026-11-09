/**
 * @file courierDelivery.ts
 * @description Courier action: confirm to Admin that an order was delivered, with a proof
 * photo (status stays with Admin). The proof goes to a private bucket and is addressed by path only; it is
 * readable by Owner, Admin and the assigned courier, never by customers.
 */

import { getSupabaseAuthClient } from '../api/supabaseAuth'
import { DELIVERY_PROOF_BUCKET, DELIVERY_PROOF_MIME_TYPE, buildDeliveryProofStoragePath } from '../domain/deliveryProofDomain'
import type { OrderTableRow } from '../types/orders'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'

interface CourierResult {
  orderId: string
  revision: number
  status: string
}

const getRpcClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

const getStorageClient = () => {
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase Storage is not configured.')
  return client
}

/**
 * "Konfirmasi selesai diantar": uploads the proof photo, then sends the
 * confirmation to Admin. The order status is NOT changed here; only Admin moves
 * it to delivered. The object is removed only when the RPC itself fails.
 */
export const confirmCourierDelivery = async (order: OrderTableRow, proof: Blob): Promise<void> => {
  if (!order.id) throw new Error('Order id is missing.')
  const path = buildDeliveryProofStoragePath(order.id)
  const storage = getStorageClient().storage.from(DELIVERY_PROOF_BUCKET)
  const { error: uploadError } = await storage.upload(path, proof, {
    contentType: DELIVERY_PROOF_MIME_TYPE,
    upsert: false,
    cacheControl: '3600',
  })
  if (uploadError) throw uploadError
  try {
    await getRpcClient().rpc<CourierResult>('courier_confirm_delivery', {
      p_order_id: order.id,
      p_proof_path: path,
    })
  } catch (error) {
    await storage.remove([path]).catch(() => undefined)
    throw error
  }
  await refreshBusinessOsOrdersFromRemote().catch(() => false)
}

/** Owner / Admin / assigned courier only. Storage RLS is authoritative. */
export const resolveDeliveryProofUrl = async (path: string): Promise<string> => {
  const { data, error } = await getStorageClient().storage.from(DELIVERY_PROOF_BUCKET).createSignedUrl(path, 5 * 60)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Unable to authorize the delivery proof.')
  return data.signedUrl
}
