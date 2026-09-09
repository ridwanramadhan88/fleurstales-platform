import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StorefrontReviewForm } from './StorefrontReviewForm'
import type { PublicOrderTrackingDetails } from '../../data/orderTracking'

const details: PublicOrderTrackingDetails = {
  orderNumber: 'KDM-2026-0010',
  status: 'delivered',
  fulfillment: 'delivery',
  branchId: 'branch-kedamaian',
  branchName: 'Kedamaian',
  customerName: 'Rani Anggraini',
  customerWhatsapp: '081234567890',
  customerEmail: 'rani@email.com',
  customerBirthday: '2000-04-21',
  customerProfile: {
    domicile: 'Kedaton',
    ageRange: '25_34',
    gender: 'female',
    occupation: 'private_employee',
    acquisitionSource: 'social_content',
    promoPreferences: ['discount'],
  },
  paymentStatus: 'paid',
  itemsSubtotalIdr: 350000,
  deliveryFeeIdr: 20000,
  discountIdr: 0,
  totalIdr: 370000,
  reviewQuestions: [
    { id: 'review_product_quality', question: 'Product quality', displayOrder: 10 },
  ],
  items: [{ name: 'Rose Bouquet', quantity: 1, unitPriceIdr: 350000 }],
}

describe('StorefrontReviewForm', () => {
  it('prefills known customer data and uses horizontal star ratings', async () => {
    const user = userEvent.setup()
    render(
      <StorefrontReviewForm
        trackingId="4ad6338a-c580-4e94-8e86-b814c34e8ea4"
        details={details}
        onSubmitted={vi.fn(async () => undefined)}
      />,
    )

    expect(screen.getByDisplayValue('Rani Anggraini')).toBeInTheDocument()
    expect(screen.getByDisplayValue('rani@email.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('081234567890')).toHaveAttribute('readonly')
    expect(screen.getByDisplayValue('Kedaton')).toBeInTheDocument()

    const rating = screen.getByRole('group', { name: 'Product quality' })
    const stars = within(rating).getAllByRole('button', { name: /Rate [1-5] out of 5/ })
    expect(stars).toHaveLength(5)

    await user.click(within(rating).getByRole('button', { name: 'Rate 4 out of 5' }))
    expect(within(rating).getByText('4 / 5')).toBeInTheDocument()
  })
})
