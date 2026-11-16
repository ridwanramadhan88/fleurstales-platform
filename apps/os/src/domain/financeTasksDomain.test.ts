import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { makeFinanceTransaction as tx } from '../test/factories/financeTransaction'
import { buildFinanceTasks } from './financeTasksDomain'

const payment = (orderNumber: string, overrides = {}) =>
  tx({ source: 'order_payment', entryMode: 'automatic', orderNumber, amount: 250_000, ...overrides })

describe('finance tasks', () => {
  const orders = [
    makeOrder({ orderNumber: 'A', customerName: 'Ani', status: 'delivered', paymentStatus: 'paid' }),
    makeOrder({ orderNumber: 'B', customerName: 'Budi', status: 'delivered', paymentStatus: 'paid', financeVerificationStatus: 'rejected' }),
    makeOrder({ orderNumber: 'C', customerName: 'Citra', status: 'delivered', paymentStatus: 'paid', financeVerified: true }),
    makeOrder({ orderNumber: 'D', customerName: 'Dewi', paymentStatus: 'refund_pending', refundAmountIdr: 90_000 }),
    makeOrder({ orderNumber: 'E', customerName: 'Eka', status: 'delivered', paymentStatus: 'paid', pendingChangeRequest: { type: 'edit', reason: 'Wrong card', requestedBy: 'Admin', requestedAt: '2026-11-10T00:00:00Z' } as never }),
  ]
  const transactions = [payment('A'), payment('B'), payment('C'), payment('X', { status: 'void' })]

  it('lists only work Finance can act on and counts it once', () => {
    const tasks = buildFinanceTasks({
      orders,
      transactions,
      payrollProposals: [{ status: 'submitted_to_finance' }, { status: 'returned_to_hr' }, { status: 'finance_approved' }],
      purchaseCount: 2,
    })
    expect(tasks.reconciliation.map((row) => row.order.orderNumber)).toEqual(['A'])
    expect(tasks.awaitingAdmin.map((row) => row.order.orderNumber)).toEqual(['B'])
    expect(tasks.refunds.map((order) => order.orderNumber)).toEqual(['D'])
    expect(tasks.requests.map((order) => order.orderNumber)).toEqual(['E'])
    expect(tasks.counts).toMatchObject({
      requests: 1,
      purchases: 2,
      reconciliation: 1,
      awaitingAdmin: 1,
      refunds: 1,
      payrollReview: 1,
      payrollReady: 1,
      accounts: 0,
    })
    // Returned-to-Admin payments and payroll returned to HR wait on others.
    expect(tasks.counts.total).toBe(1 + 2 + 1 + 1 + 1 + 1)
  })

  it('narrows the lists with the search box', () => {
    const tasks = buildFinanceTasks({ orders, transactions, payrollProposals: [], searchQuery: 'dewi' })
    expect(tasks.reconciliation).toHaveLength(0)
    expect(tasks.refunds.map((order) => order.orderNumber)).toEqual(['D'])
  })

  it('counts verified rows without an account as cleanup work', () => {
    const tasks = buildFinanceTasks({
      orders: [],
      transactions: [tx({ accountId: undefined }), tx({ accountId: 'legacy:unassigned' }), tx({ accountId: undefined, status: 'void' })],
      payrollProposals: [],
    })
    expect(tasks.counts.accounts).toBe(2)
  })
})
