import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { completeOrderRefund, initiateOrderRefund } from './orderRefundDomain'

const finance = { name: 'Fina', role: 'finance' as const }

describe('order refund domain', () => {
  it('initiates a full refund only for a paid order', () => {
    const result = initiateOrderRefund({ order: makeOrder({ paymentStatus: 'paid', totalIdr: 100, paidAmountIdr: 100 }), actor: finance, reason: 'Duplicate payment', initiatedAt: '2026-07-10T00:00:00Z' })
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.order).toMatchObject({ paymentStatus: 'refund_pending', refundAmountIdr: 100, refundReason: 'Duplicate payment' })
  })
  it.each(['unpaid','partial','refund_pending','refunded'] as const)('blocks initiation from %s', (paymentStatus) => {
    expect(initiateOrderRefund({ order: makeOrder({ paymentStatus }), actor: finance, reason: 'Reason', initiatedAt: 'x' }).allowed).toBe(false)
  })
  it('requires Finance or Owner and a reason', () => {
    const order=makeOrder({ paymentStatus:'paid', totalIdr:100, paidAmountIdr:100 })
    expect(initiateOrderRefund({ order, actor:{name:'A',role:'admin'}, reason:'Reason', initiatedAt:'x' }).allowed).toBe(false)
    expect(initiateOrderRefund({ order, actor:finance, reason:' ', initiatedAt:'x' }).allowed).toBe(false)
  })
  it('completes only a documented pending refund and clears paid amount', () => {
    const pending=makeOrder({ paymentStatus:'refund_pending', paidAmountIdr:100, refundAmountIdr:100, refundReason:'Reason', refundInitiatedBy:'Fina', refundInitiatedAt:'x' })
    const result=completeOrderRefund({ order:pending, actor:finance, completedAt:'y' })
    expect(result.allowed).toBe(true)
    if(result.allowed) expect(result.order).toMatchObject({ paymentStatus:'refunded', paidAmountIdr:0, refundCompletedBy:'Fina' })
  })
})
