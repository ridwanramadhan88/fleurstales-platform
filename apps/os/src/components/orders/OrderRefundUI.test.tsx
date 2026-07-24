import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import type { OrderDetailsViewModel } from './OrderDetailsController'
import { OrderRefundDialog } from './OrderRefundDialog'
import { OrderRefundPanel } from './OrderRefundPanel'

const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'IDR' })

const makeViewModel = (overrides: Partial<OrderDetailsViewModel> = {}) => ({
  order: makeOrder({ paymentStatus: 'paid', paidAmountIdr: 250_000, totalIdr: 250_000 }),
  formatter,
  canManageRefund: true,
  canCompleteRefund: true,
  onOpenInitiateRefund: vi.fn(),
  onOpenCompleteRefund: vi.fn(),
  ...overrides,
}) as unknown as OrderDetailsViewModel

describe('Order refund UI', () => {
  it('keeps paid-order refund initiation out of the inline panel', () => {
    const { container, rerender } = render(<OrderRefundPanel viewModel={makeViewModel()} />)

    expect(container).toBeEmptyDOMElement()

    rerender(<OrderRefundPanel viewModel={makeViewModel({ canManageRefund: false })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows pending refund evidence and completion action', () => {
    const onComplete = vi.fn()
    render(<OrderRefundPanel viewModel={makeViewModel({
      order: makeOrder({
        paymentStatus: 'refund_pending',
        refundAmountIdr: 250_000,
        refundReason: 'Duplicate payment',
        refundInitiatedBy: 'Fina',
        refundInitiatedAt: '2026-07-10T10:00:00.000Z',
      }),
      onOpenCompleteRefund: onComplete,
    })} />)

    expect(screen.getByText('Refund pending')).toBeInTheDocument()
    expect(screen.getByText('Duplicate payment')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Refund' }))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('requires a reason before initiating', () => {
    const onConfirm = vi.fn()
    const onReasonChange = vi.fn()
    render(<OrderRefundDialog
      mode="initiate"
      order={makeOrder({ paymentStatus: 'paid', paidAmountIdr: 250_000 })}
      formatter={formatter}
      reason=""
      onReasonChange={onReasonChange}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />)

    expect(screen.getByRole('button', { name: 'Initiate refund' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Refund reason'), { target: { value: 'Duplicate' } })
    expect(onReasonChange).toHaveBeenCalledWith('Duplicate')
  })

  it('shows immutable completion evidence after refund', () => {
    render(<OrderRefundPanel viewModel={makeViewModel({
      order: makeOrder({
        paymentStatus: 'refunded',
        paidAmountIdr: 0,
        refundAmountIdr: 250_000,
        refundReason: 'Duplicate payment',
        refundInitiatedBy: 'Fina',
        refundInitiatedAt: '2026-07-10T10:00:00.000Z',
        refundCompletedBy: 'Owner',
        refundCompletedAt: '2026-07-10T11:00:00.000Z',
      }),
    })} />)

    expect(screen.getByText('Refund completed')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
