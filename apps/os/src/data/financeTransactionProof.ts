import { getSupabaseAuthClient } from '../api/supabaseAuth'
import type { FinanceTransaction } from '../store/financeStoreTypes'

const MANUAL_PROOF_BUCKET = 'finance-transaction-proofs'
const ORDER_PROOF_BUCKET = 'order-payment-proofs'
const MAX_PROOF_BYTES = 5 * 1024 * 1024
const ALLOWED_PROOF_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

const extensionForFile = (file: File): string => {
  if (file.type === 'image/jpeg') return 'jpg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  if (file.type === 'application/pdf') return 'pdf'
  return 'bin'
}

const randomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const validateProof = (file: File): void => {
  if (!ALLOWED_PROOF_TYPES.has(file.type)) {
    throw new Error('Bukti transaksi harus berupa JPG, PNG, WEBP, atau PDF.')
  }
  if (file.size <= 0 || file.size > MAX_PROOF_BYTES) {
    throw new Error('Ukuran bukti transaksi maksimal 5 MB.')
  }
}

export interface UploadedFinanceTransactionProof {
  path: string
  fileName: string
}

export const uploadFinanceTransactionProof = async (
  file: File,
): Promise<UploadedFinanceTransactionProof> => {
  validateProof(file)
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase Storage is not configured.')

  const { data: userData, error: userError } = await client.auth.getUser()
  if (userError || !userData.user?.id) {
    throw new Error(userError?.message || 'Finance user session is unavailable.')
  }

  const path = `${userData.user.id}/${new Date().toISOString().slice(0, 10)}/${randomId()}.${extensionForFile(file)}`
  const { error } = await client.storage
    .from(MANUAL_PROOF_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false,
    })

  if (error) throw new Error(error.message || 'Unable to upload transaction proof.')
  return { path, fileName: file.name }
}

export const removeFinanceTransactionProof = async (path?: string): Promise<void> => {
  if (!path) return
  const client = getSupabaseAuthClient()
  if (!client) return
  await client.storage.from(MANUAL_PROOF_BUCKET).remove([path])
}

const isDisplayUrl = (value: string): boolean =>
  value.startsWith('data:') || /^https?:\/\//i.test(value)

export const resolveFinanceTransactionProofUrl = async (
  transaction: Pick<FinanceTransaction, 'source' | 'proofPath'>,
): Promise<string> => {
  const value = transaction.proofPath
  if (!value) throw new Error('Bukti transaksi tidak tersedia.')
  if (isDisplayUrl(value)) return value

  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase Storage is not configured.')
  const bucket = transaction.source === 'order_payment' ? ORDER_PROOF_BUCKET : MANUAL_PROOF_BUCKET
  const { data, error } = await client.storage.from(bucket).createSignedUrl(value, 5 * 60)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Unable to authorize transaction proof.')
  }
  return data.signedUrl
}

export const openFinanceTransactionProof = async (
  transaction: Pick<FinanceTransaction, 'source' | 'proofPath'>,
): Promise<void> => {
  const popup = typeof window !== 'undefined' ? window.open('', '_blank') : null
  try {
    const url = await resolveFinanceTransactionProofUrl(transaction)
    if (!popup) throw new Error('Allow pop-ups to open transaction proof.')
    popup.opener = null
    popup.location.href = url
  } catch (error) {
    popup?.close()
    throw error
  }
}
