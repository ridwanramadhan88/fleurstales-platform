import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getStaffReviews: vi.fn(),
}))

vi.mock('../../data/staffReviews', () => ({
  getStaffReviews: mocks.getStaffReviews,
}))

import { StaffReviewHistory } from './StaffReviewHistory'

describe('StaffReviewHistory synchronization', () => {
  beforeEach(() => mocks.getStaffReviews.mockReset())

  it('refreshes submitted reviews when staff returns to the app', async () => {
    mocks.getStaffReviews
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'review-1',
          orderId: 'order-1',
          orderNumber: 'KDM-2026-0013',
          customerId: 'customer-1',
          customerName: 'Customer',
          submittedAt: '2026-09-05T05:47:52.170Z',
          note: 'Tingkatkan lagi',
          averageScore: 3,
          answers: [
            { questionId: 'quality', question: 'Kualitas produk', score: 2 },
            { questionId: 'service', question: 'Pelayanan', score: 4 },
          ],
          reward: {
            id: 'reward-1',
            percentOff: 10,
            minOrderIdr: 300000,
            status: 'available',
            issuedAt: '2026-09-05T05:47:52.170Z',
          },
        },
      ])

    render(
      <StaffReviewHistory
        orderId="order-1"
        title="Customer review"
        emptyLabel="No review submitted for this order."
      />,
    )

    expect(await screen.findByText('No review submitted for this order.')).toBeInTheDocument()
    expect(mocks.getStaffReviews).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(mocks.getStaffReviews).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Customer · KDM-2026-0013')).toBeInTheDocument()
    expect(screen.getByText('Tingkatkan lagi')).toBeInTheDocument()
    expect(screen.getByText('Reward 10% off · min Rp 300.000')).toBeInTheDocument()
  })
})
