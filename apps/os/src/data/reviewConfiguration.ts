import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { isSupabaseConfigured } from './shared/supabaseConfig'

export interface ReviewQuestionConfig {
  id: string
  question: string
  displayOrder: number
  isActive: boolean
}

export interface ReviewRewardConfig {
  enabled: boolean
  percentOff: number
  minOrderIdr: number
  revision: number
}

export interface ReviewConfiguration {
  questions: ReviewQuestionConfig[]
  reward: ReviewRewardConfig
}

const LOCAL_KEY = 'fleurstales-review-configuration-v1'
const DEFAULT_CONFIG: ReviewConfiguration = {
  questions: [
    { id: 'review_product_quality', question: 'Kualitas produk', displayOrder: 10, isActive: true },
    { id: 'review_service', question: 'Pelayanan', displayOrder: 20, isActive: true },
    { id: 'review_fulfillment', question: 'Pengiriman / Pickup', displayOrder: 30, isActive: true },
  ],
  reward: { enabled: true, percentOff: 10, minOrderIdr: 300_000, revision: 1 },
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

const readLocal = (): ReviewConfiguration => {
  if (typeof window === 'undefined') return structuredClone(DEFAULT_CONFIG)
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? 'null') as ReviewConfiguration | null
    return parsed?.questions && parsed.reward ? parsed : structuredClone(DEFAULT_CONFIG)
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

const writeLocal = (config: ReviewConfiguration): ReviewConfiguration => {
  if (typeof window !== 'undefined') window.localStorage.setItem(LOCAL_KEY, JSON.stringify(config))
  return config
}

export const getReviewConfiguration = async (): Promise<ReviewConfiguration> => {
  if (!isSupabaseConfigured()) return readLocal()
  return getClient().rpc<ReviewConfiguration>('get_review_configuration', {})
}

export const saveReviewQuestions = async (
  questions: ReviewQuestionConfig[],
): Promise<ReviewConfiguration> => {
  if (!isSupabaseConfigured()) {
    const current = readLocal()
    const next = {
      ...current,
      questions: questions.map((question, index) => ({
        ...question,
        displayOrder: (index + 1) * 10,
      })),
    }
    return writeLocal(next)
  }
  return getClient().rpc<ReviewConfiguration>('save_review_questions', {
    p_questions: questions.map((question) => ({
      id: question.id,
      question: question.question.trim(),
      isActive: question.isActive,
    })),
  })
}

export const saveReviewRewardSettings = async (
  reward: ReviewRewardConfig,
): Promise<ReviewConfiguration> => {
  if (!isSupabaseConfigured()) {
    const current = readLocal()
    return writeLocal({
      ...current,
      reward: { ...reward, revision: reward.revision + 1 },
    })
  }
  return getClient().rpc<ReviewConfiguration>('save_review_reward_settings', {
    p_enabled: reward.enabled,
    p_percent_off: reward.percentOff,
    p_min_order_idr: Math.round(reward.minOrderIdr),
    p_expected_revision: reward.revision,
  })
}
