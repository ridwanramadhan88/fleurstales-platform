import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

vi.mock('./shared/bootstrap', () => ({
  bootstrapSharedData: () => ({
    enabled: true,
    repositories: { client: { rpc: mocks.rpc } },
  }),
}))

import {
  getPublicOrderTracking,
  submitPublicOrderReview,
  type PublicOrderTrackingDetails,
  type SubmitReviewResult,
} from './orderTracking'

describe('customer review tracking synchronization', () => {
  beforeEach(() => mocks.rpc.mockReset())

  it('keeps a committed review visible until the tracking backend confirms it', async () => {
    const trackingId = 'tracking-review-sync'
    const details: PublicOrderTrackingDetails = {
      orderNumber: 'KDM-2026-0013',
      status: 'delivered',
      fulfillment: 'delivery',
      branchId: 'Kedamaian',
      customerName: 'Customer',
      paymentStatus: 'paid',
      itemsSubtotalIdr: 150000,
      deliveryFeeIdr: 15000,
      discountIdr: 0,
      totalIdr: 165000,
      reviewSubmitted: false,
      reviewQuestions: [
        { id: 'quality', question: 'Kualitas produk', displayOrder: 10 },
        { id: 'service', question: 'Pelayanan', displayOrder: 20 },
      ],
      items: [{ name: 'Bouquet', quantity: 1, unitPriceIdr: 150000 }],
    }
    const submitResult: SubmitReviewResult = {
      reviewSubmitted: true,
      reviewId: 'review-1',
      reward: { id: 'reward-1', percentOff: 10, minOrderIdr: 300000, status: 'available' },
    }

    mocks.rpc
      .mockResolvedValueOnce(details)
      .mockResolvedValueOnce(submitResult)
      .mockResolvedValueOnce(details)
      .mockRejectedValueOnce(new Error('tracking refresh unavailable'))

    await expect(getPublicOrderTracking(trackingId)).resolves.toEqual(details)
    await expect(submitPublicOrderReview(
      trackingId,
      [
        { questionId: 'quality', score: 4 },
        { questionId: 'service', score: 5 },
      ],
      'Bagus',
    )).resolves.toEqual(submitResult)

    const staleRefresh = await getPublicOrderTracking(trackingId)
    expect(staleRefresh?.reviewSubmitted).toBe(true)
    expect(staleRefresh?.reviewQuestions).toEqual([])
    expect(staleRefresh?.review?.note).toBe('Bagus')
    expect(staleRefresh?.review?.answers).toEqual([
      { questionId: 'quality', question: 'Kualitas produk', score: 4 },
      { questionId: 'service', question: 'Pelayanan', score: 5 },
    ])
    expect(staleRefresh?.reviewReward).toMatchObject({
      percentOff: 10,
      minOrderIdr: 300000,
      status: 'available',
    })

    const failedRefresh = await getPublicOrderTracking(trackingId)
    expect(failedRefresh?.reviewSubmitted).toBe(true)
    expect(failedRefresh?.review?.note).toBe('Bagus')
  })
})
