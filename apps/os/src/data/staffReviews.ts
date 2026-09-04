import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { isSharedBackendConfigured } from '../api/remoteSession'

export interface StaffReviewAnswer {
  questionId: string
  question: string
  score: number
}

export interface StaffReviewReward {
  id: string
  percentOff: number
  minOrderIdr: number
  status: 'available' | 'redeemed'
  issuedAt: string
  redeemedAt: string | null
  redeemedOrderId: string | null
}

export interface StaffReview {
  id: string
  orderId: string
  orderNumber: string
  customerId: string
  customerName: string | null
  customerWhatsapp: string | null
  submittedAt: string
  note: string | null
  averageScore: number
  answers: StaffReviewAnswer[]
  reward: StaffReviewReward | null
}

interface StaffReviewResponse {
  reviews: StaffReview[]
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

export const getStaffReviews = async (filters?: {
  orderId?: string
  customerId?: string
}): Promise<StaffReview[]> => {
  if (!isSharedBackendConfigured()) return []

  const result = await getClient().rpc<StaffReviewResponse>('get_staff_reviews', {
    p_order_id: filters?.orderId ?? null,
    p_customer_id: filters?.customerId ?? null,
  })

  return Array.isArray(result?.reviews) ? result.reviews : []
}
