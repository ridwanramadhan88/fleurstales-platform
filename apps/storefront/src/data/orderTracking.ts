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

const trackingDetailsCache = new Map<string, PublicOrderTrackingDetails>()
const reviewSyncFallbackIds = new Set<string>()

const getPublicClient = () => {
  const shared = bootstrapSharedData()
  if (!shared.enabled) throw new Error('Order tracking is unavailable right now.')
  return shared.repositories.client
}

export const getPublicOrderTracking = async (trackingId: string): Promise<PublicOrderTrackingDetails | null> => {
  try {
    const result = await getPublicClient().rpc<PublicOrderTrackingDetails | null>('get_order_public_status', {
      p_tracking_id: trackingId,
    })
    if (result) {
      trackingDetailsCache.set(trackingId, result)
      reviewSyncFallbackIds.delete(trackingId)
    }
    return result
  } catch (cause) {
    const cached = trackingDetailsCache.get(trackingId)
    if (reviewSyncFallbackIds.has(trackingId) && cached?.reviewSubmitted) return cached
    throw cause
  }
}

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
): Promise<SubmitReviewResult> => {
  const result = await getPublicClient().rpc<SubmitReviewResult>('submit_order_review', {
    p_tracking_id: trackingId,
    p_answers: answers,
    p_note: note?.trim() || null,
  })

  const cached = trackingDetailsCache.get(trackingId)
  if (cached) {
    const submittedAt = new Date().toISOString()
    const questionById = new Map((cached.reviewQuestions ?? []).map((question) => [question.id, question.question]))
    trackingDetailsCache.set(trackingId, {
      ...cached,
      reviewSubmitted: true,
      reviewQuestions: [],
      review: {
        note: note?.trim() || null,
        submittedAt,
        answers: answers.map((answer) => ({
          ...answer,
          question: questionById.get(answer.questionId) ?? answer.questionId,
        })),
      },
      reviewReward: result.reward
        ? {
            percentOff: result.reward.percentOff,
            minOrderIdr: result.reward.minOrderIdr,
            status: result.reward.status,
            issuedAt: submittedAt,
          }
        : cached.reviewReward,
    })
    reviewSyncFallbackIds.add(trackingId)
  }

  return result
}
