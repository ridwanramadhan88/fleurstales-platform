/**
 * @file orderMediaUpload.ts
 * @description Storage upload for the two order-lifecycle photos (finish
 * photo, payment proof). Both buckets are public — mirrors the
 * `product-images` bucket, not the private `attendance-selfies` one — so the
 * upload returns a direct public URL rather than a signed one.
 */

import { getSupabaseAuthClient } from '../api/supabaseAuth'
import { FINISH_PHOTO_BUCKET, FINISH_PHOTO_MIME_TYPE, buildFinishPhotoStoragePath } from '../domain/orderFinishPhotoDomain'
import { PAYMENT_PROOF_BUCKET, PAYMENT_PROOF_MIME_TYPE, buildPaymentProofStoragePath } from '../domain/paymentProofImageDomain'

const uploadPublicOrderImage = async (
  bucket: string,
  path: string,
  blob: Blob,
  contentType: string,
): Promise<string> => {
  const authClient = getSupabaseAuthClient()
  if (!authClient) throw new Error('Supabase Storage is not configured.')

  const { error } = await authClient.storage.from(bucket).upload(path, blob, {
    contentType,
    upsert: false,
    cacheControl: '3600',
  })
  if (error) throw error

  const { data } = authClient.storage.from(bucket).getPublicUrl(path)
  if (!data?.publicUrl) throw new Error('Could not resolve the uploaded image URL.')
  return data.publicUrl
}

export const uploadOrderFinishPhoto = (orderId: string, blob: Blob): Promise<string> =>
  uploadPublicOrderImage(FINISH_PHOTO_BUCKET, buildFinishPhotoStoragePath(orderId), blob, FINISH_PHOTO_MIME_TYPE)

export const uploadOrderPaymentProof = (orderId: string, blob: Blob): Promise<string> =>
  uploadPublicOrderImage(PAYMENT_PROOF_BUCKET, buildPaymentProofStoragePath(orderId), blob, PAYMENT_PROOF_MIME_TYPE)
