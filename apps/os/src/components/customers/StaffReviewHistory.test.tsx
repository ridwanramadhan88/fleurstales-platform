import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('keeps the list compact and reveals the saved review question set on demand', async () => {
    mocks.getStaffReviews
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'review-1',
          orderId: 'order-1',
          orderNumber: 'KDM-2026-0013',
          customerId: 'customer-1',
          customerName: 'Customer',
          customerWhatsapp: '08123456789',
          submittedAt: '2026-09-05T05:47:52.170Z',
          note: 'Tingkatkan lagi',
          averageScore: 3.7,
          answers: [
            { questionId: 'quality', question: 'Product quality', score: 2 },
            { questionId: 'service', question: 'Service', score: 4 },
            { questionId: 'whatsapp', question: 'WhatsApp response time', score: 5 },
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
    const customerName = await screen.findByText('Customer')
    expect(screen.getByText('KDM-2026-0013')).toBeInTheDocument()
    expect(screen.getByText('3.7')).toBeInTheDocument()

    expect(screen.queryByText('Product quality')).not.toBeInTheDocument()
    expect(screen.queryByText('WhatsApp response time')).not.toBeInTheDocument()
    expect(screen.queryByText('Tingkatkan lagi')).not.toBeInTheDocument()
    expect(screen.queryByText(/Reward 10% off/)).not.toBeInTheDocument()
    expect(screen.queryByText('08123456789')).not.toBeInTheDocument()

    const reviewButton = customerName.closest('button')
    expect(reviewButton).not.toBeNull()
    fireEvent.click(reviewButton!)

    expect(screen.getByText('Product quality')).toBeInTheDocument()
    expect(screen.getByText('Service')).toBeInTheDocument()
    expect(screen.getByText('WhatsApp response time')).toBeInTheDocument()
    expect(screen.getByText('Tingkatkan lagi')).toBeInTheDocument()
    expect(screen.queryByText(/Reward 10% off/)).not.toBeInTheDocument()
  })
})
