/**
 * @file courierDelivery.ts
 * @description Courier actions: start a delivery and complete it with a proof
 * photo. The proof goes to a private bucket and is addressed by path only; it is
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

/** "Mulai antar": ready → delivering, only for the courier assigned to the order. */
export const startCourierDelivery = async (order: OrderTableRow): Promise<void> => {
  if (!order.id) throw new Error('Order id is missing.')
  await getRpcClient().rpc<CourierResult>('courier_start_delivery', {
    p_order_id: order.id,
    p_expected_revision: order.revision ?? 1,
  })
  await refreshBusinessOsOrdersFromRemote().catch(() => false)
}

/**
 * "Terkirim": uploads the proof photo, then completes the delivery. The object
 * is removed only when the authoritative RPC itself fails.
 */
export const completeCourierDelivery = async (order: OrderTableRow, proof: Blob): Promise<void> => {
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
    await getRpcClient().rpc<CourierResult>('courier_complete_delivery', {
      p_order_id: order.id,
      p_expected_revision: order.revision ?? 1,
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
