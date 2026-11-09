/**
 * @file deliveryProofDomain.ts
 * @description Proof-of-delivery photo ("foto bukti terima") taken by the
 * courier. Internal only: it lives in a private bucket and is never part of the
 * customer tracking page.
 */

import { buildPaymentProofStoragePath } from './paymentProofImageDomain'

export const DELIVERY_PROOF_BUCKET = 'order-delivery-proofs'
export const DELIVERY_PROOF_MIME_TYPE = 'image/jpeg' as const

/** `<orderId>/proof-<nonce>.jpg`, the shape the database and Storage policy expect. */
export const buildDeliveryProofStoragePath = (orderId: string): string => buildPaymentProofStoragePath(orderId)

export interface CourierTask {
  order: import('../types/orders').OrderTableRow
  stage: 'ready' | 'delivering'
}

const scheduleKey = (order: { scheduleDate?: string; scheduleTime?: string }): string =>
  `${order.scheduleDate ?? '9999-12-31'}T${order.scheduleTime ?? '23:59'}`

/**
 * The courier's active tasks: orders assigned to this courier that are ready to
 * leave or already on the way, earliest schedule first. Orders already on the
 * way are listed before the ones still waiting.
 */
export const getCourierTasks = (
  orders: readonly import('../types/orders').OrderTableRow[],
  employeeId: string,
): CourierTask[] =>
  orders
    .filter((order) =>
      Boolean(employeeId)
      && order.deliveryCourierEmployeeId === employeeId
      && (order.status === 'ready' || order.status === 'delivering'))
    .map((order) => ({ order, stage: order.status === 'delivering' ? 'delivering' as const : 'ready' as const }))
    .sort((a, b) => {
      if (a.stage !== b.stage) return a.stage === 'delivering' ? -1 : 1
      return scheduleKey(a.order).localeCompare(scheduleKey(b.order))
    })

/** Digits-only phone for `tel:` / wa.me links; Indonesian local `0` becomes `62`. */
export const toDialDigits = (phone: string | undefined): string => {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}
