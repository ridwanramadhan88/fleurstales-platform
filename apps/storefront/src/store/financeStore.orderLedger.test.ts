import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFinanceStore } from './financeStore'

const originalTransactions = useFinanceStore.getState().transactions

beforeEach(() => useFinanceStore.setState({ transactions: [] }))
afterEach(() => useFinanceStore.setState({ transactions: originalTransactions }))

const command = {
  orderNumber: 'ORD-1',
  branch: 'Kedamaian',
  amount: 150_000,
  method: 'transfer' as const,
  sourceEventId: 'payment-event-1',
  idempotencyKey: 'payment-key-1',
  actor: 'Owner',
  occurredAt: '2026-07-12T00:00:00.000Z',
}

describe('automatic order ledger posting', () => {
  it('posts one immutable order-payment entry and treats a matching retry as idempotent', () => {
    const first = useFinanceStore.getState().recordOrderPayment(command)
    const replay = useFinanceStore.getState().recordOrderPayment({ ...command, sourceEventId: 'retry-event' })

    expect(first.allowed).toBe(true)
    expect(replay).toMatchObject({ allowed: true, duplicate: true, transactionId: first.transactionId })
    expect(useFinanceStore.getState().transactions).toHaveLength(1)
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      type: 'income', category: 'order_payment', source: 'order_payment',
      amount: 150_000, isSystemGenerated: true, status: 'pending',
    })
  })

  it('rejects an idempotency-key collision with a different monetary command', () => {
    useFinanceStore.getState().recordOrderPayment(command)
    const collision = useFinanceStore.getState().recordOrderPayment({ ...command, amount: 999_000 })

    expect(collision).toMatchObject({ allowed: false })
    expect(collision.reason).toContain('different ledger command')
    expect(useFinanceStore.getState().transactions).toHaveLength(1)
  })

  it('verifies pending payment and correction entries together when Finance verifies the order', () => {
    useFinanceStore.getState().recordOrderPayment(command)
    useFinanceStore.getState().recordOrderRefund({
      ...command,
      amount: 50_000,
      sourceEventId: 'reversal-event',
      idempotencyKey: 'reversal-key',
    })

    const result = useFinanceStore.getState().verifyOrderTransactions({
      orderNumber: 'ORD-1', actor: { name: 'Finance', role: 'finance' },
      completedAt: '2026-07-14T09:30:00.000Z',
    })

    expect(result).toMatchObject({ allowed: true, verifiedCount: 2 })
    expect(useFinanceStore.getState().transactions.every((item) => item.status === 'verified')).toBe(true)
  })


  it('keeps an order transaction pending when the real completion time is missing', () => {
    useFinanceStore.getState().recordOrderPayment(command)
    const result = useFinanceStore.getState().verifyOrderTransactions({
      orderNumber:'ORD-1',
      actor:{ name:'Finance', role:'finance' },
    })
    expect(result).toMatchObject({ allowed:false, verifiedCount:0 })
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      status:'pending',
      dataWarning:'Order completion time is missing. Correct the order before confirming this transaction.',
    })
  })

  it('prevents manual rejection of system-generated order entries', () => {
    const posted = useFinanceStore.getState().recordOrderPayment(command)
    const rejected = useFinanceStore.getState().rejectTransaction({
      transactionId: posted.transactionId!, actor: { name: 'Finance', role: 'finance' },
    })

    expect(rejected).toMatchObject({ allowed: false })
    expect(useFinanceStore.getState().transactions[0].status).toBe('pending')
  })
})
