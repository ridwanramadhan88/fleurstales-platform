import { describe, expect, it } from 'vitest'
import { countOrdersAwaitingReconciliation, getFinanceAttention } from './financeAttentionDomain'

const order = (orderNumber: string, overrides: Record<string, unknown> = {}) =>
  ({ orderNumber, financeVerified: false, paymentStatus: 'paid', ...overrides }) as never

const posted = (orderNumber: string) =>
  ({ status: 'verified', source: 'order_payment', orderNumber, accountId: 'cash:main' }) as never

describe('finance attention', () => {
  it('counts orders posted to the ledger and not yet reconciled', () => {
    const attention = getFinanceAttention({
      orders: [order('A'), order('B', { financeVerificationStatus: 'rejected' }), order('C', { financeVerified: true })],
      transactions: [posted('A'), posted('B'), posted('C')],
      payrollProposals: [],
    })
    expect(attention.awaiting).toBe(1)
    expect(attention.correction).toBe(1)
    expect(countOrdersAwaitingReconciliation(attention)).toBe(2)
  })

  it('does not count a new order still waiting for admin confirmation', () => {
    const attention = getFinanceAttention({
      orders: [order('NEW', { status: 'pending_verification' })],
      transactions: [],
      payrollProposals: [],
    })
    expect(countOrdersAwaitingReconciliation(attention)).toBe(0)
    expect(attention.total).toBe(0)
  })

  it('adds refunds and payroll to the total', () => {
    const attention = getFinanceAttention({
      orders: [order('R', { paymentStatus: 'refund_pending' })],
      transactions: [],
      payrollProposals: [{ status: 'submitted_to_finance' }, { status: 'finance_approved' }] as never,
    })
    expect(attention).toMatchObject({ refunds: 1, payrollReview: 1, payrollReady: 1, total: 3 })
  })
})
