import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getReviewConfiguration: vi.fn(),
  saveReviewQuestions: vi.fn(),
  saveReviewRewardSettings: vi.fn(),
}))

vi.mock('../../store/userStore', () => ({
  useUserStore: (selector: (state: { role: string }) => unknown) => selector({ role: 'admin' }),
}))

vi.mock('../../data/reviewConfiguration', () => ({
  getReviewConfiguration: mocks.getReviewConfiguration,
  saveReviewQuestions: mocks.saveReviewQuestions,
  saveReviewRewardSettings: mocks.saveReviewRewardSettings,
}))

import { ReviewPromoSettings } from './ReviewPromoSettings'

const config = {
  questions: [
    { id: 'quality', question: 'Kualitas produk', displayOrder: 10, isActive: true },
    { id: 'service', question: 'Pelayanan', displayOrder: 20, isActive: true },
  ],
  reward: { enabled: true, percentOff: 10, minOrderIdr: 300000, revision: 1 },
}

describe('ReviewPromoSettings dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getReviewConfiguration.mockResolvedValue(config)
  })

  it('keeps settings closed until staff opens the review promo button', async () => {
    render(<ReviewPromoSettings />)

    expect(screen.queryByText('Review promo')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Review & promo' }))

    expect(await screen.findByText('Review promo')).toBeInTheDocument()
    expect(mocks.getReviewConfiguration).toHaveBeenCalledTimes(1)
    expect(screen.getByDisplayValue('Kualitas produk')).toBeInTheDocument()
  })
})
