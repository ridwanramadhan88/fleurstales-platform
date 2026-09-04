import { bootstrapSharedData } from './shared/bootstrap'
import type { OrderFulfillment, OrderStatus, PaymentMethod, PaymentStatus } from './shared/databaseTypes'

export interface PublicOrderTrackingItem {
  name: string
  variant?: string | null
  quantity: number
  unitPriceIdr: number
}

export interface PublicPaymentAccountSnapshot {
  accountId: string
  bankName: string
  accountNumber: string
  accountHolder: string
  type?: string
}

export interface PublicReviewQuestion {
  id: string
  question: string
  displayOrder: number
}

export interface PublicSubmittedReview {
  note?: string | null
  submittedAt: string
  answers: Array<{
    questionId: string
    question: string
    score: number
  }>
}

export interface PublicReviewReward {
  percentOff: number
  minOrderIdr: number
  status: 'available' | 'redeemed'
  issuedAt: string
  redeemedAt?: string | null
}

export interface PublicOrderTrackingDetails {
  orderNumber: string
  status: OrderStatus
  fulfillment: OrderFulfillment
  branchId: string
  branchName?: string | null
  branchAddress?: string | null
  customerName: string
  customerWhatsapp?: string | null
  contactWhatsapp?: string | null
  deliveryAddress?: string | null
  deliveryInstructions?: string | null
  scheduleDate?: string | null
  scheduleTime?: string | null
  requestedPickupDate?: string | null
  requestedPickupTime?: string | null
  paymentStatus: PaymentStatus
  paymentMethod?: PaymentMethod | null
  paymentAccountSnapshot?: PublicPaymentAccountSnapshot | null
  itemsSubtotalIdr: number
  deliveryFeeIdr: number
  discountIdr: number
  totalIdr: number
  cancellationReason?: string | null
  reviewSubmitted?: boolean
  reviewQuestions?: PublicReviewQuestion[]
  review?: PublicSubmittedReview | null
  reviewReward?: PublicReviewReward | null
  items: PublicOrderTrackingItem[]
}

export interface PublicOrderStatusSummary {
  orderNumber: string
  status: OrderStatus
  fulfillment: OrderFulfillment
  branchName?: string | null
  scheduleDate?: string | null
  scheduleTime?: string | null
  requestedPickupDate?: string | null
  requestedPickupTime?: string | null
}

export interface TrackingAccessResult {
  orderNumber: string
  publicTrackingId: string
}

export interface SubmitReviewResult {
  reviewSubmitted: true
  reviewId: string
  reward?: {
    id: string
    percentOff: number
    minOrderIdr: number
    status: 'available'
  } | null
}

const getPublicClient = () => {
  const shared = bootstrapSharedData()
  if (!shared.enabled) throw new Error('Order tracking is unavailable right now.')
  return shared.repositories.client
}

export const getPublicOrderTracking = async (trackingId: string): Promise<PublicOrderTrackingDetails | null> =>
  getPublicClient().rpc<PublicOrderTrackingDetails | null>('get_order_public_status', {
    p_tracking_id: trackingId,
  })

export const searchPublicOrderStatus = async (orderNumber: string): Promise<PublicOrderStatusSummary | null> =>
  getPublicClient().rpc<PublicOrderStatusSummary | null>('search_order_public_status', {
    p_order_number: orderNumber.trim(),
  })

export const verifyPublicOrderTrackingAccess = async (
  orderNumber: string,
  whatsappNumber: string,
): Promise<TrackingAccessResult | null> =>
  getPublicClient().rpc<TrackingAccessResult | null>('verify_order_tracking_access', {
    p_order_number: orderNumber.trim(),
    p_whatsapp_number: whatsappNumber.trim(),
  })

export const submitPublicOrderReview = async (
  trackingId: string,
  answers: Array<{ questionId: string; score: number }>,
  note?: string,
): Promise<SubmitReviewResult> =>
  getPublicClient().rpc<SubmitReviewResult>('submit_order_review', {
    p_tracking_id: trackingId,
    p_answers: answers,
    p_note: note?.trim() || null,
  })
