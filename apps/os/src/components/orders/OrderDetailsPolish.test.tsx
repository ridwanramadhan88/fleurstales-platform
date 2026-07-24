import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { OrderDetailsDeliverySection } from './OrderDetailsDeliverySection'
import { OrderDetailsHeader } from './OrderDetailsHeader'

const baseOrder = makeOrder({
  greetingCardName: 'Untuk Ibu Sari',
  giftMessage: 'Selamat ulang tahun',
  status: 'picked_up',
  financeVerified: false,
  completedAt: '2026-07-09T10:00:00.000Z',
})

const makeViewModel = (
  overrides: Partial<OrderDetailsViewModel> = {},
): OrderDetailsViewModel =>
  ({
    order: baseOrder,
    productDisplay: { name: 'Test Bouquet' },
    urgency: 'done',
    currentUserRole: 'admin',
    canEdit: false,
    canVerify: false,
    canVerifyThisOrder: false,
    canRequestChange: false,
    hasPendingRequest: false,
    locked: true,
    isEditing: false,
    isCancellable: true,
    draft: {},
    onClose: vi.fn(),
    setIsEditing: vi.fn(),
    onDraftChange: vi.fn(),
    onCancelOrder: vi.fn(),
    onVerifyOrder: vi.fn(),
    onOpenRequestModal: vi.fn(),
    onFulfillmentChange: vi.fn(),
    ...overrides,
  }) as unknown as OrderDetailsViewModel

describe('order details collection polish', () => {
  it('shows the admin collection label without hiding it on mobile', () => {
    render(<OrderDetailsHeader viewModel={makeViewModel()} />)

    const label = screen.getByText('Sent to Payment Verification')
    expect(label).toBeInTheDocument()
    expect(label.className).not.toContain('hidden')
    expect(screen.queryByText('Awaiting Finance')).not.toBeInTheDocument()
  })

  it('keeps greeting and operational-note editing behind the main edit action', () => {
    render(
      <OrderDetailsDeliverySection
        viewModel={makeViewModel({ canEdit: true })}
      />,
    )

    expect(screen.getByText('Greeting card message')).toBeInTheDocument()
    expect(screen.getByText('Operational note')).toBeInTheDocument()
    expect(screen.getByText('Name on card')).toBeInTheDocument()
    expect(screen.getByText('Untuk Ibu Sari')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Edit details' }),
    ).not.toBeInTheDocument()
  })
})
