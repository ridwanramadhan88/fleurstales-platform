import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { useFinanceStore } from './financeStore'
import { useOrdersStore } from './ordersStore'

const originalOrders = useOrdersStore.getState().orders
const originalSequence = useOrdersStore.getState().lastSequence
const originalTransactions = useFinanceStore.getState().transactions

const actor = { employeeId: 'owner-1', name: 'Owner', role: 'owner' as const }

beforeEach(() => {
  useFinanceStore.setState({ transactions: [] })
  useOrdersStore.setState({
    orders: [makeOrder({
      id: 'order-1', revision: 1, updatedAt: '2026-07-12T00:00:00.000Z',
      orderNumber: 'ORD-1', status: 'confirmed', paymentStatus: 'unpaid', paidAmountIdr: 0,
      totalIdr: 200_000, paymentMethod: 'transfer', paymentHistory: [],
    })],
  })
})

afterEach(() => {
  useOrdersStore.setState({ orders: originalOrders, lastSequence: originalSequence })
  useFinanceStore.setState({ transactions: originalTransactions })
})

describe('order payment transaction correctness', () => {
  it('writes the aggregate, immutable payment event, and linked ledger entry together', () => {
    const result = useOrdersStore.getState().updatePayment({
      orderNumber: 'ORD-1', expectedRevision: 1, actor,
      paymentStatus: 'partial', paidAmountIdr: 75_000,
      paymentMethod: 'transfer', reference: 'BANK-REF-001', proofId: 'proof-001',
      idempotencyKey: 'order-1-payment-1',
    })

    expect(result.allowed).toBe(true)
    const order = useOrdersStore.getState().orders[0]
    expect(order).toMatchObject({ paymentStatus: 'partial', paidAmountIdr: 75_000, revision: 2 })
    expect(order.paymentHistory).toHaveLength(1)
    expect(order.paymentHistory?.[0]).toMatchObject({
      type: 'payment_received', amountIdr: 75_000,
      reference: 'BANK-REF-001', proofId: 'proof-001',
    })
    expect(order.paymentHistory?.[0].ledgerTransactionId).toBeDefined()
    expect(useFinanceStore.getState().transactions).toHaveLength(1)
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      orderNumber: 'ORD-1', amount: 75_000, category: 'order_payment',
      idempotencyKey: 'order-1-payment-1',
    })
  })

  it('creates a reversal expense instead of mutating the original income entry', () => {
    useOrdersStore.getState().updatePayment({
      orderNumber: 'ORD-1', expectedRevision: 1, actor,
      paymentStatus: 'paid', paidAmountIdr: 200_000,
      idempotencyKey: 'payment-full',
    })
    const revision = useOrdersStore.getState().orders[0].revision ?? 2
    const reversal = useOrdersStore.getState().updatePayment({
      orderNumber: 'ORD-1', expectedRevision: revision, actor,
      paymentStatus: 'partial', paidAmountIdr: 100_000,
      idempotencyKey: 'payment-correction', note: 'Bank correction',
    })

    expect(reversal.allowed).toBe(true)
    const transactions = useFinanceStore.getState().transactions
    expect(transactions).toHaveLength(2)
    expect(transactions.find((item) => item.category === 'order_payment')).toMatchObject({ amount: 200_000 })
    expect(transactions.find((item) => item.category === 'order_refund')).toMatchObject({ amount: 100_000, status: 'pending' })
    expect(useOrdersStore.getState().orders[0].paymentHistory?.map((event) => event.type)).toEqual([
      'payment_received', 'payment_reversed',
    ])
  })
})
