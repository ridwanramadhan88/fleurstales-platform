import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeOrder } from '../../test/factories/order'
import { useUserStore } from '../../store/userStore'
import { useOrdersStore } from '../../store/ordersStore'
import { OrderDetailsPanelController } from './OrderDetailsPanelController'
import { getOrderNextActionLabel } from './orderNextActionLabels'

const formatter = new Intl.NumberFormat('id-ID')
const originalRole = useUserStore.getState().role
const originalOrders = useOrdersStore.getState().orders

const deliveryOrder = makeOrder({
  orderNumber: 'KDM-2026-0101',
  customerName: 'Dita Anjani',
  customerSnapshot: { name: 'Dita Anjani', whatsappNumber: '081234567890' },
  fulfillment: 'delivery',
  status: 'processing',
  paymentStatus: 'paid',
  paidAmountIdr: 190000,
  totalIdr: 190000,
  scheduleDate: '2026-10-03',
  scheduleTime: '14:00',
  deliveryAddress: 'Jl. Ahmad Yani 12',
} as never)

describe('next-step action labels', () => {
  it.each([
    ['pending_verification', 'pickup', 'Review & confirm'],
    ['confirmed', 'pickup', 'Assign & start'],
    ['processing', 'delivery', 'Mark ready'],
    ['ready', 'delivery', 'Start delivery'],
    ['ready', 'pickup', 'Complete pickup'],
    ['delivering', 'delivery', 'Mark delivered'],
  ] as const)('%s (%s) → %s', (status, fulfillment, label) => {
    expect(getOrderNextActionLabel({ status, fulfillment })).toBe(label)
  })
})

describe('order details panel', () => {
  beforeEach(() => {
    // Owner works across branches, so no shift branch is needed here.
    useUserStore.getState().setRole('owner')
    useOrdersStore.setState({ orders: [deliveryOrder] })
  })
  afterEach(() => {
    useUserStore.getState().setRole(originalRole)
    useOrdersStore.setState({ orders: originalOrders })
  })

  it('shows phone, time and address without expanding anything', () => {
    render(<OrderDetailsPanelController order={deliveryOrder} onClose={vi.fn()} formatter={formatter} />)

    const keyInfo = screen.getByRole('region', { name: 'Customer and fulfillment' })
    expect(within(keyInfo).getByRole('link', { name: '081234567890' })).toHaveAttribute('href', expect.stringContaining('wa.me/6281234567890'))
    expect(within(keyInfo).getByText(/^Delivery · /)).toBeInTheDocument()
    expect(within(keyInfo).getByText('Jl. Ahmad Yani 12')).toBeVisible()
    // Not inside a collapsed <details>.
    expect(keyInfo.closest('details')).toBeNull()
  })

  it('labels the next step with the action, in primary style', () => {
    render(<OrderDetailsPanelController order={deliveryOrder} onClose={vi.fn()} formatter={formatter} />)

    const next = screen.getByRole('button', { name: 'Mark ready' })
    expect(next).toHaveClass('bg-primary', 'text-primary-foreground')
  })

  it('shows the order number once, without a second "Order" label', () => {
    render(<OrderDetailsPanelController order={deliveryOrder} onClose={vi.fn()} formatter={formatter} />)
    const header = document.querySelector('[data-order-details-header]') as HTMLElement
    expect(within(header).queryByText('Order')).toBeNull()
    expect(within(header).getByText('KDM-2026-0101')).toBeInTheDocument()
  })

  it('does not show a large empty image frame when the item has no photo', () => {
    render(<OrderDetailsPanelController order={deliveryOrder} onClose={vi.fn()} formatter={formatter} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Details' }))
    expect(screen.queryAllByTestId('order-item-no-photo').length).toBeGreaterThan(0)
    expect(document.querySelector('.size-40')).toBeNull()
  })
})
