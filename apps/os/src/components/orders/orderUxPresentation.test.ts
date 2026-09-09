import { describe, expect, it } from 'vitest'
import type { OrderTableRow } from '../../types/orders'
import { getOrderFinancePresentation } from './orderUxPresentation'

const makeOrder = (patch: Partial<OrderTableRow> = {}): OrderTableRow => ({
  orderNumber: 'KDM-2026-0010',
  customerName: 'Rani',
  source: 'customer_app',
  fulfillment: 'delivery',
  status: 'processing',
  totalIdr: 500000,
  branch: 'Kedamaian',
  paymentStatus: 'paid',
  paymentMethod: 'transfer',
  paidAmountIdr: 500000,
  createdAtLabel: '2026-09-09T10:00:00+07:00',
  paymentProofUrl: 'proof/path.jpg',
  ...patch,
})

describe('order UX finance presentation', () => {
  it('keeps a finance mismatch prominent even after Operations reaches Ready', () => {
    const result = getOrderFinancePresentation(makeOrder({
      status: 'ready',
      paidAmountIdr: 450000,
    }))

    expect(result.needsAttention).toBe(true)
    expect(result.paymentMismatch).toBe(true)
    expect(result.differenceIdr).toBe(50000)
  })

  it('treats verified payment as resolved when there is no evidence exception', () => {
    const result = getOrderFinancePresentation(makeOrder({
      status: 'delivered',
      financeVerified: true,
    }))

    expect(result.resolved).toBe(true)
    expect(result.needsAttention).toBe(false)
  })

  it('keeps missing transfer evidence visible even if Finance was marked verified', () => {
    const result = getOrderFinancePresentation(makeOrder({
      status: 'delivered',
      financeVerified: true,
      paymentProofUrl: undefined,
    }))

    expect(result.resolved).toBe(true)
    expect(result.missingRequiredProof).toBe(true)
    expect(result.needsAttention).toBe(true)
  })
})
