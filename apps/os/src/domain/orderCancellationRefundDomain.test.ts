import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { queueCancellationRefund, CANCELLATION_REFUND_REASON } from './orderCancellationRefundDomain'
import {
  canCancelOrderRefund,
  canCompleteOrderRefund,
  canInitiateOrderRefund,
  cancelOrderRefund,
  cancellationRequiresRefund,
} from './orderRefundDomain'

describe('refund authority (2026-10-22)', () => {
  it('lets Finance and Owner start refunds, but only Finance withdraws or completes them', () => {
    expect(canInitiateOrderRefund('finance')).toBe(true)
    expect(canInitiateOrderRefund('owner')).toBe(true)
    expect(canInitiateOrderRefund('admin')).toBe(false)
    expect(canCancelOrderRefund('owner')).toBe(false)
    expect(canCancelOrderRefund('finance')).toBe(true)
    expect(canCompleteOrderRefund('finance')).toBe(true)
    expect(canCompleteOrderRefund('owner')).toBe(false)
  })

  it('never withdraws the pending refund of a cancelled order', () => {
    const order = makeOrder({ status: 'cancelled', paymentStatus: 'refund_pending', paidAmountIdr: 100, refundAmountIdr: 100 })
    const result = cancelOrderRefund({ order, actor: { name: 'Fina', role: 'finance' }, reason: 'Customer changed mind', cancelledAt: 'x' })
    expect(result.allowed).toBe(false)
  })
})

describe('cancelling a paid order', () => {
  it('requires a refund only when money was received', () => {
    expect(cancellationRequiresRefund(makeOrder({ paymentStatus: 'paid', paidAmountIdr: 33000 }))).toBe(true)
    expect(cancellationRequiresRefund(makeOrder({ paymentStatus: 'unpaid', paidAmountIdr: 0 }))).toBe(false)
  })

  it('queues the full paid amount with a refund_initiated ledger event', () => {
    const before = makeOrder({ id: 'order_1', status: 'processing', paymentStatus: 'paid', paymentMethod: 'cash', totalIdr: 33000, paidAmountIdr: 33000 })
    const cancelled = { ...before, status: 'cancelled' as const }
    const result = queueCancellationRefund(cancelled, before, { name: 'Akbar', role: 'admin' }, 4)
    expect(result).toMatchObject({
      status: 'cancelled',
      paymentStatus: 'refund_pending',
      paidAmountIdr: 33000,
      refundAmountIdr: 33000,
      refundReason: CANCELLATION_REFUND_REASON,
      refundInitiatedBy: 'Akbar',
    })
    const event = result.paymentHistory?.at(-1)
    expect(event).toMatchObject({ type: 'refund_initiated', amountIdr: 33000, resultingStatus: 'refund_pending', resultingPaidAmountIdr: 33000 })
  })
})
