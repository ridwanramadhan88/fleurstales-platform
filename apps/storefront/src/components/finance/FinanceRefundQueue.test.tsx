import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import { useOrdersStore } from '../../store/ordersStore'
import { useOrderRuntimeStore } from '../../store/orderRuntimeStore'
import { FinanceRefundQueue } from './FinanceRefundQueue'

const pendingOrder = makeOrder({
  orderNumber: 'KDM-REF-001',
  paymentStatus: 'refund_pending',
  paidAmountIdr: 250_000,
  refundAmountIdr: 250_000,
  refundReason: 'Duplicate payment',
  refundInitiatedBy: 'Finance',
  refundInitiatedAt: '2026-07-10T10:00:00.000Z',
})

const completedOrder = makeOrder({
  orderNumber: 'KDM-REF-002',
  paymentStatus: 'refunded',
  paidAmountIdr: 0,
  refundAmountIdr: 100_000,
  refundReason: 'Cancelled after payment',
  refundInitiatedBy: 'Finance',
  refundInitiatedAt: '2026-07-09T10:00:00.000Z',
  refundCompletedBy: 'Owner',
  refundCompletedAt: '2026-07-09T12:00:00.000Z',
})

describe('FinanceRefundQueue', () => {
  beforeEach(() => {
    useOrdersStore.setState({ orders: [pendingOrder, completedOrder] })
    useOrderRuntimeStore.setState({ activities: {} })
  })

  it('shows pending count, evidence, tabs, and opens an order', () => {
    const onOpenOrder = vi.fn()
    render(
      <FinanceRefundQueue
        orders={[pendingOrder, completedOrder]}
        actorName="Finance"
        actorRole="finance"
        onOpenOrder={onOpenOrder}
      />,
    )

    expect(screen.getByText('1 pending')).toBeInTheDocument()
    expect(screen.getByText('Duplicate payment')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /KDM-REF-001/ }))
    expect(onOpenOrder).toHaveBeenCalledWith('KDM-REF-001')

    fireEvent.click(screen.getByRole('tab', { name: 'Completed (1)' }))
    expect(screen.getByText('Cancelled after payment')).toBeInTheDocument()
    expect(screen.getByText('Owner')).toBeInTheDocument()
  })

  it('completes a pending refund through the guarded command', () => {
    render(
      <FinanceRefundQueue
        orders={[pendingOrder, completedOrder]}
        actorName="Finance"
        actorRole="finance"
        onOpenOrder={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Complete Refund' }))
    expect(screen.getByRole('alertdialog', { name: 'Confirm funds returned?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Refund' }))

    expect(useOrdersStore.getState().orders[0]).toMatchObject({
      orderNumber: 'KDM-REF-001',
      paymentStatus: 'refunded',
      paidAmountIdr: 0,
      refundCompletedBy: 'Finance',
    })
    expect(useOrderRuntimeStore.getState().activities['KDM-REF-001']?.[0]?.description).toBe('Refund completed by Finance')
  })


  it('allows Owner to view refunds without showing the completion action', () => {
    render(
      <FinanceRefundQueue
        orders={[pendingOrder, completedOrder]}
        actorName="Owner"
        actorRole="owner"
        onOpenOrder={vi.fn()}
      />,
    )

    expect(screen.getByText('Duplicate payment')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete Refund' })).not.toBeInTheDocument()
  })

  it('is hidden from roles that cannot manage refunds', () => {
    const { container } = render(
      <FinanceRefundQueue
        orders={[pendingOrder]}
        actorName="Admin"
        actorRole="admin"
        onOpenOrder={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps the dialog open and shows the domain error for stale actions', () => {
    render(
      <FinanceRefundQueue
        orders={[pendingOrder]}
        actorName="Finance"
        actorRole="finance"
        onOpenOrder={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Complete Refund' }))
    useOrdersStore.setState({ orders: [{ ...pendingOrder, paymentStatus: 'refunded' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Refund' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Only a pending refund can be completed.')
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
