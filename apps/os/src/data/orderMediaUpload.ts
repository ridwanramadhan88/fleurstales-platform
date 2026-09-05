/**
 * @file orderMediaUpload.ts
 * @description Storage adapter for order lifecycle media. Finished-order
 * photos are customer-visible public assets; transfer proofs are private
 * Finance evidence and are addressed by Storage path only.
 */

import { getSupabaseAuthClient } from '../api/supabaseAuth'
import { FINISH_PHOTO_BUCKET, FINISH_PHOTO_MIME_TYPE, buildFinishPhotoStoragePath } from '../domain/orderFinishPhotoDomain'
import { PAYMENT_PROOF_BUCKET, PAYMENT_PROOF_MIME_TYPE, buildPaymentProofStoragePath } from '../domain/paymentProofImageDomain'
import type { OrderTableRow } from '../types/orders'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'
import { useOrdersStore } from '../store/ordersStore'
import { isSharedBackendConfigured } from '../api/remoteSession'

const getStorageClient = () => {
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase Storage is not configured.')
  return client
}

const uploadOrderImage = async (
  bucket: string,
  path: string,
  blob: Blob,
  contentType: string,
): Promise<void> => {
  const client = getStorageClient()
  const { error } = await client.storage.from(bucket).upload(path, blob, {
    contentType,
    upsert: false,
    cacheControl: '3600',
  })
  if (error) throw error
}

const removeOrderImage = async (bucket: string, path: string): Promise<void> => {
  if (!path) return
  const client = getStorageClient()
  const { error } = await client.storage.from(bucket).remove([path])
  if (error) throw error
}

const publicFinishPhotoPathFromUrl = (url: string): string | null => {
  const marker = `/storage/v1/object/public/${FINISH_PHOTO_BUCKET}/`
  const index = url.indexOf(marker)
  if (index < 0) return null
  return decodeURIComponent(url.slice(index + marker.length))
}

export const uploadOrderFinishPhoto = async (orderId: string, blob: Blob): Promise<string> => {
  const path = buildFinishPhotoStoragePath(orderId)
  await uploadOrderImage(FINISH_PHOTO_BUCKET, path, blob, FINISH_PHOTO_MIME_TYPE)
  const { data } = getStorageClient().storage.from(FINISH_PHOTO_BUCKET).getPublicUrl(path)
  if (!data?.publicUrl) {
    await removeOrderImage(FINISH_PHOTO_BUCKET, path).catch(() => undefined)
    throw new Error('Could not resolve the uploaded finish photo URL.')
  }
  return data.publicUrl
}

export const removeOrderFinishPhoto = async (url: string): Promise<void> => {
  const path = publicFinishPhotoPathFromUrl(url)
  if (!path) return
  await removeOrderImage(FINISH_PHOTO_BUCKET, path)
}

/** Private transfer proofs return only their Storage object path. */
export const uploadOrderPaymentProof = async (orderId: string, blob: Blob): Promise<string> => {
  const path = buildPaymentProofStoragePath(orderId)
  await uploadOrderImage(PAYMENT_PROOF_BUCKET, path, blob, PAYMENT_PROOF_MIME_TYPE)
  return path
}

export const removeOrderPaymentProof = (path: string): Promise<void> =>
  removeOrderImage(PAYMENT_PROOF_BUCKET, path)

/** Finance-only viewer. Storage RLS is authoritative; other roles cannot sign/read. */
export const resolveOrderPaymentProofUrl = async (path: string): Promise<string> => {
  const client = getStorageClient()
  const { data, error } = await client.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrl(path, 5 * 60)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Unable to authorize payment proof.')
  return data.signedUrl
}

export const openOrderPaymentProof = async (path: string): Promise<void> => {
  const popup = typeof window !== 'undefined' ? window.open('', '_blank') : null
  try {
    const url = await resolveOrderPaymentProofUrl(path)
    if (!popup) throw new Error('Allow pop-ups to open payment proof.')
    popup.opener = null
    popup.location.href = url
  } catch (error) {
    popup?.close()
    throw error
  }
}

interface AttachFinishPhotoResult {
  orderId: string
  orderNumber: string
  revision: number
  finishPhotoUrl: string
  finishPhotoUploadedAt: string
}

/**
 * Persist an already-uploaded finish photo immediately. The object is removed
 * only if the authoritative RPC itself fails. Once the RPC commits, a later
 * refresh failure must never delete the now-referenced Storage object.
 */
export const attachOrderFinishPhoto = async (
  order: OrderTableRow,
  finishPhotoUrl: string,
  uploadedBy: string,
): Promise<OrderTableRow> => {
  if (!order.id) throw new Error('Order id is missing.')

  if (!isSharedBackendConfigured()) {
    const user = await import('../store/userStore').then(({ useUserStore }) => useUserStore.getState())
    const result = useOrdersStore.getState().setOrderFinishPhoto({
      orderNumber: order.orderNumber,
      expectedRevision: order.revision ?? 1,
      finishPhotoUrl,
      finishPhotoUploadedBy: uploadedBy,
      actor: { employeeId: user.employeeId, name: user.name, role: user.role, branchId: user.branchId },
    })
    if (!result.allowed) {
      await removeOrderFinishPhoto(finishPhotoUrl).catch(() => undefined)
      throw new Error(result.reason)
    }
    return result.order
  }

  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')

  try {
    await shared.repositories.client.rpc<AttachFinishPhotoResult>('attach_order_finish_photo', {
      p_order_id: order.id,
      p_expected_revision: order.revision ?? 1,
      p_finish_photo_url: finishPhotoUrl,
      p_uploaded_by: uploadedBy,
    })
  } catch (error) {
    await removeOrderFinishPhoto(finishPhotoUrl).catch(() => undefined)
    throw error
  }

  const refreshed = await refreshBusinessOsOrdersFromRemote()
  if (!refreshed) throw new Error('Finish photo was saved, but the latest order could not be reloaded.')
  const next = useOrdersStore.getState().orders.find((item) => item.orderNumber === order.orderNumber)
  if (!next) throw new Error('Finish photo was saved, but the order is missing from the refreshed list.')
  return next
}
