import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrdersTabHeader } from './OrdersTabHeader'

const counts = { active: 0, completed: 0, needsAttention: 0 }

describe('OrdersTabHeader recovery states', () => {
  it('keeps New order visible and explains a temporary branch block', () => {
    render(
      <OrdersTabHeader
        activeOrdersSubTab="today"
        orderCounts={counts}
        draftCount={0}
        canCreateOrder={false}
        createOrderBlockedReason="Select a specific branch before creating an order."
        onNewOrder={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'New order' })).toBeDisabled()
    expect(screen.getByText('Select a specific branch before creating an order.')).toBeInTheDocument()
  })

  it('keeps the same action-area geometry when branch availability changes', () => {
    const { rerender } = render(
      <OrdersTabHeader
        activeOrdersSubTab="today"
        orderCounts={counts}
        draftCount={0}
        canCreateOrder={false}
        createOrderBlockedReason="Select a specific branch before creating an order."
        onNewOrder={vi.fn()}
      />,
    )

    const blockedAreaClass = screen.getByTestId('new-order-action-area').className
    const blockedButton = screen.getByRole('button', { name: 'New order' })
    expect(blockedButton).toHaveClass('h-10', 'w-full', 'sm:w-[10.25rem]')
    expect(screen.getByTestId('new-order-helper-row')).not.toHaveClass('sm:invisible')

    rerender(
      <OrdersTabHeader
        activeOrdersSubTab="today"
        orderCounts={counts}
        draftCount={0}
        canCreateOrder
        onNewOrder={vi.fn()}
      />,
    )

    expect(screen.getByTestId('new-order-action-area').className).toBe(blockedAreaClass)
    expect(screen.getByRole('button', { name: 'New order' })).toHaveClass(
      'h-10',
      'w-full',
      'sm:w-[10.25rem]',
    )
    expect(screen.getByTestId('new-order-helper-row')).toHaveClass('sm:invisible')
    expect(screen.getByTestId('new-order-helper-row')).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not expose order creation to a role that cannot create orders', () => {
    render(
      <OrdersTabHeader
        activeOrdersSubTab="today"
        orderCounts={counts}
        draftCount={0}
        canCreateOrder={false}
        onNewOrder={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'New order' })).not.toBeInTheDocument()
  })
})
