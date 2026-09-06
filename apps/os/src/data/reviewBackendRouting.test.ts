import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}))

vi.mock('./shared/bootstrap', () => ({
  bootstrapSharedData: () => ({
    enabled: true as const,
    repositories: {
      client: { rpc: mocks.rpc },
    },
  }),
}))

vi.mock('./shared/supabaseConfig', () => ({
  isSupabaseConfigured: mocks.isSupabaseConfigured,
}))

vi.mock('./shared/supabaseSession', () => ({
  browserSupabaseTokenProvider: { getAccessToken: vi.fn() },
}))

import {
  getReviewConfiguration,
  saveReviewQuestions,
  saveReviewRewardSettings,
} from './reviewConfiguration'
import { getStaffReviews } from './staffReviews'

describe('hosted review workspace backend routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isSupabaseConfigured.mockReturnValue(true)
  })

  it('loads submitted customer feedback through get_staff_reviews', async () => {
    mocks.rpc.mockResolvedValue({
      reviews: [
        {
          id: 'review-1',
          orderId: 'order-1',
          orderNumber: 'KDM-2026-0015',
          customerId: 'customer-1',
          customerName: 'Customer',
          customerWhatsapp: '628123456789',
          submittedAt: '2026-09-06T08:32:02.309Z',
          note: 'Mantap',
          averageScore: 5,
          answers: [],
          reward: null,
        },
      ],
    })

    const reviews = await getStaffReviews()

    expect(mocks.isSupabaseConfigured).toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('get_staff_reviews', {
      p_order_id: null,
      p_customer_id: null,
    })
    expect(reviews).toHaveLength(1)
    expect(reviews[0]?.note).toBe('Mantap')
  })

  it('loads and saves review configuration through Supabase RPCs', async () => {
    const config = {
      questions: [
        { id: 'quality', question: 'Kualitas produk', displayOrder: 10, isActive: true },
      ],
      reward: { enabled: true, percentOff: 10, minOrderIdr: 300000, revision: 4 },
    }

    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'get_review_configuration') return Promise.resolve(config)
      if (name === 'save_review_questions') return Promise.resolve({ ...config, reward: { ...config.reward, revision: 5 } })
      if (name === 'save_review_reward_settings') return Promise.resolve({ ...config, reward: { ...config.reward, revision: 6 } })
      throw new Error(`Unexpected RPC ${name}`)
    })

    await expect(getReviewConfiguration()).resolves.toEqual(config)
    await saveReviewQuestions(config.questions)
    await saveReviewRewardSettings(config.reward)

    expect(mocks.rpc).toHaveBeenCalledWith('get_review_configuration', {})
    expect(mocks.rpc).toHaveBeenCalledWith('save_review_questions', {
      p_questions: [{ id: 'quality', question: 'Kualitas produk', isActive: true }],
    })
    expect(mocks.rpc).toHaveBeenCalledWith('save_review_reward_settings', {
      p_enabled: true,
      p_percent_off: 10,
      p_min_order_idr: 300000,
      p_expected_revision: 4,
    })
  })
})
