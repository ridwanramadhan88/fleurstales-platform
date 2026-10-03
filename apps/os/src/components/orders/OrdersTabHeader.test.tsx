import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
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

    const blockedButton = screen.getByRole('button', { name: 'Select branch first' })
    expect(blockedButton).toHaveAttribute('aria-disabled', 'true')
    expect(blockedButton).toHaveTextContent('Select branch first')
    expect(screen.getByRole('status')).toHaveTextContent('Select a specific branch before creating an order.')
  })

  it('shows why New order is blocked as visible text, without tapping', () => {
    render(
      <OrdersTabHeader
        activeOrdersSubTab="today"
        orderCounts={counts}
        draftCount={0}
        canCreateOrder={false}
        createOrderBlockedReason="No branch is assigned for your current shift. Ask HR or Owner to update the schedule."
        onNewOrder={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Ask HR or Owner to update the schedule.')
  })

  it('lets an owner on all branches pick a branch right under the blocked button', () => {
    const onSelect = vi.fn()
    render(
      <OrdersTabHeader
        activeOrdersSubTab="today"
        orderCounts={counts}
        draftCount={0}
        canCreateOrder={false}
        createOrderBlockedReason="Select a specific branch before creating an order."
        branchPicker={{ options: [{ id: 'Kedamaian', label: 'Kedamaian' }, { id: 'Pahoman', label: 'Pahoman' }], onSelect }}
        onNewOrder={vi.fn()}
      />,
    )

    const picker = screen.getByRole('combobox', { name: /Choose a branch to create an order/ })
    fireEvent.change(picker, { target: { value: 'Pahoman' } })
    expect(onSelect).toHaveBeenCalledWith('Pahoman')
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
    const blockedButton = screen.getByRole('button', { name: 'Select branch first' })
    expect(blockedButton).toHaveClass('h-11', 'w-full', 'sm:w-auto')
    expect(blockedButton).toHaveAttribute('aria-disabled', 'true')

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
      'h-11',
      'w-full',
      'sm:w-auto',
    )
    expect(screen.getByRole('button', { name: 'New order' })).not.toHaveAttribute('aria-disabled')
  })

  it('uses compact mobile summary geometry without changing tablet cards', () => {
    render(
      <OrdersTabHeader
        activeOrdersSubTab="today"
        orderCounts={{ active: 4, completed: 2, needsAttention: 1 }}
        draftCount={3}
        canCreateOrder
        onNewOrder={vi.fn()}
      />,
    )

    expect(screen.getByText('Active orders').closest('div')?.parentElement?.className).toContain('p-3')
    expect(screen.getByText('Active orders').closest('div')?.parentElement?.className).toContain('sm:p-4')
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
