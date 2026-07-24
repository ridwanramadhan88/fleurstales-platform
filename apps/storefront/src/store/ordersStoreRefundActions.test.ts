import { beforeEach, describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import { useOrdersStore } from './ordersStore'
import { useFinanceStore } from './financeStore'

const finance = { name: 'Fina', role: 'finance' as const }

beforeEach(() => {
  useOrdersStore.setState({ orders: [makeOrder({ orderNumber:'A', paymentStatus:'paid', totalIdr:100, paidAmountIdr:100 })] })
  useFinanceStore.setState({ transactions: [] })
})

describe('orders store refund actions', () => {
  it('moves paid -> refund_pending -> refunded through dedicated commands', () => {
    expect(useOrdersStore.getState().initiateRefund({ orderNumber:'A', expectedRevision:1, actor:finance, reason:'Duplicate' }).allowed).toBe(true)
    expect(useOrdersStore.getState().orders[0].paymentStatus).toBe('refund_pending')
    expect(useOrdersStore.getState().completeRefund({ orderNumber:'A', expectedRevision:2, actor:finance }).allowed).toBe(true)
    expect(useOrdersStore.getState().orders[0]).toMatchObject({ paymentStatus:'refunded', paidAmountIdr:0 })
    expect(useFinanceStore.getState().transactions).toHaveLength(1)
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      orderNumber: 'A',
      category: 'order_refund',
      status: 'verified',
    })
  })

  it('does not mutate on repeated or unauthorized commands', () => {
    expect(useOrdersStore.getState().initiateRefund({ orderNumber:'A', expectedRevision:1, actor:{name:'Admin',role:'admin'}, reason:'Duplicate' }).allowed).toBe(false)
    expect(useOrdersStore.getState().orders[0].paymentStatus).toBe('paid')
    expect(useOrdersStore.getState().completeRefund({ orderNumber:'A', expectedRevision:1, actor:finance }).allowed).toBe(false)
    expect(useOrdersStore.getState().orders[0].paymentStatus).toBe('paid')
  })
})
