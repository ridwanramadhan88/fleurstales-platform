import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminTodayQueue } from '../components/dashboard/AdminTodayQueue'
import { RevenueTrendCard } from '../components/dashboard/RevenueTrendCard'
import { useOrdersStore } from '../store/ordersStore'
import { useFinanceStore } from '../store/financeStore'
import { makeOrder } from './factories/order'
import { getLocalDateString, nowInJakarta } from '../domain/orderTimingDomain'

const originalOrders = useOrdersStore.getState().orders
const originalTransactions = useFinanceStore.getState().transactions
afterEach(() => {
  useOrdersStore.setState({ orders: originalOrders })
  useFinanceStore.setState({ transactions: originalTransactions })
})

const today = getLocalDateString(nowInJakarta())

describe('UX audit: numbers and order agree across screens', () => {
  it('"work from the top": the priority list is ordered by due time, not just by day', () => {
    useOrdersStore.setState({ orders: [
      makeOrder({ id: 'a', orderNumber: 'LATE-AFTERNOON', status: 'confirmed', branch: 'Kedamaian', scheduleDate: today, scheduleTime: '14:00' } as never),
      makeOrder({ id: 'b', orderNumber: 'EVENING', status: 'processing', branch: 'Kedamaian', scheduleDate: today, scheduleTime: '17:30:00' } as never),
      makeOrder({ id: 'c', orderNumber: 'MORNING', status: 'confirmed', branch: 'Kedamaian', scheduleDate: today, scheduleTime: '9:00' } as never),
    ] })
    render(<AdminTodayQueue activeBranch="Kedamaian" onGoToOrders={vi.fn()} onOpenOrder={vi.fn()} />)
    const numbers = screen.getAllByText(/^(MORNING|LATE-AFTERNOON|EVENING)$/).map((node) => node.textContent)
    expect(numbers).toEqual(['MORNING', 'LATE-AFTERNOON', 'EVENING'])
  })

  it('the home revenue chart counts confirmed payments, like the Revenue screen', () => {
    // A big order that is not paid yet must not appear as revenue.
    useOrdersStore.setState({ orders: [
      makeOrder({ id: 'x', orderNumber: 'BIG', status: 'delivered', branch: 'Kedamaian', scheduleDate: today, totalIdr: 2_000_000 } as never),
    ] })
    useFinanceStore.setState({ transactions: [
      { id: 't1', status: 'verified', source: 'order_payment', type: 'income', category: 'order_payment', branch: 'Kedamaian', amount: 250_000, orderNumber: 'PAID', transactionDate: today, createdAt: new Date().toISOString(), method: 'Transfer', description: 'PAID' } as never,
    ] })
    render(<RevenueTrendCard activeBranch="Kedamaian" onOpenRevenue={vi.fn()} />)
    const card = screen.getByRole('region', { name: 'Revenue last 7 days' })
    expect(within(card).getByText('Confirmed revenue, last 7 days')).toBeInTheDocument()
    expect(within(card).getByText('Rp 250.000')).toBeInTheDocument()
  })
})
