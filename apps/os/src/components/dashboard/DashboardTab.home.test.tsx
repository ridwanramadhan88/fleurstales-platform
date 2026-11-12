import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardTab } from './DashboardTab'
import { useUserStore, type UserRole } from '../../store/userStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useFinanceStore } from '../../store/financeStore'
import { makeOrder } from '../../test/factories/order'

const originalRole = useUserStore.getState().role
const originalOrders = useOrdersStore.getState().orders
const originalTransactions = useFinanceStore.getState().transactions
afterEach(() => {
  useUserStore.getState().setRole(originalRole)
  useOrdersStore.setState({ orders: originalOrders })
  useFinanceStore.setState({ transactions: originalTransactions })
})

const renderHome = (role: UserRole) => {
  useUserStore.getState().setRole(role)
  const onNavigate = vi.fn()
  render(<DashboardTab activeBranch="Kedamaian" userRole={role} greeting="Selamat pagi" formattedDate="Sabtu, 3 Okt" onNavigate={onNavigate} onGoToOrders={vi.fn()} onGoToFinishedOrders={vi.fn()} />)
  return onNavigate
}

/** Section headings / labelled regions in page order. */
const regionsInOrder = () => Array.from(document.querySelectorAll('section[aria-label], section[aria-labelledby], h2')).map((node) => node.getAttribute('aria-label') ?? node.textContent ?? '')

describe('home screens show each role its own work', () => {
  it('admin: the priority orders, with attendance moved to the top bar', () => {
    renderHome('admin')
    expect(regionsInOrder().some((label) => /priority/i.test(label))).toBe(true)
    expect(screen.queryByRole('region', { name: 'My day' })).toBeNull()
  })

  it('florist: only the orders to make, nothing above them', () => {
    renderHome('florist')
    expect(regionsInOrder()[0]).toMatch(/My assigned orders|Pesanan saya/)
    expect(screen.queryByText('My schedule')).toBeNull()
  })

  it('manager: own florist work is hidden when nothing is assigned', () => {
    renderHome('manager')
    expect(screen.queryByRole('region', { name: /My assigned orders|Pesanan saya/ })).toBeNull()
  })

  it('finance: work cards that open their queues, no Customers or Catalog shortcuts', () => {
    useOrdersStore.setState({ orders: [
      makeOrder({ orderNumber: 'NEW-1', status: 'pending_verification' }),
      makeOrder({ orderNumber: 'PAID-1', status: 'delivered', financeVerified: false }),
    ] })
    useFinanceStore.setState({ transactions: [{ id: 't', status: 'verified', source: 'order_payment', orderNumber: 'PAID-1', accountId: 'cash:main', type: 'income', amount: 1 } as never] })
    const onNavigate = renderHome('finance')
    const work = screen.getByRole('region', { name: 'Finance work' })
    const reconciliation = within(work).getByRole('button', { name: /Awaiting reconciliation/ })
    expect(reconciliation).toHaveTextContent('1')
    reconciliation.click()
    expect(onNavigate).toHaveBeenCalledWith({ tab: 'finance', financeModule: 'order_verification' })
    expect(within(work).getByRole('button', { name: /Refunds/ })).toBeInTheDocument()
    expect(within(work).getByRole('button', { name: /Payroll/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^(Customers|Catalog)$/ })).toBeNull()
  })

  it('hr: attendance, schedule and payroll work, each opening its screen', () => {
    const onNavigate = renderHome('hr')
    const work = screen.getByRole('region', { name: 'HR work' })
    within(work).getByRole('button', { name: /Attendance to review/ }).click()
    within(work).getByRole('button', { name: /Staff without a schedule/ }).click()
    within(work).getByRole('button', { name: /Payroll/ }).click()
    expect(onNavigate.mock.calls.map(([target]) => target.hrSection)).toEqual(['attendance', 'scheduling', 'payroll'])
  })

  it('owner: priority orders and a 7-day revenue trend, not an empty page', () => {
    renderHome('owner')
    expect(regionsInOrder().some((label) => /priority/i.test(label))).toBe(true)
    expect(screen.getByRole('region', { name: 'Revenue last 7 days' })).toBeInTheDocument()
  })
})
