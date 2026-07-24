import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import {
  getRemainingOrderPaymentIdr,
  shouldGateOrderAdvanceForPayment,
  shouldHighlightReadyPayment,
} from './orderPaymentGateDomain'

describe('order payment advancement gate', () => {
  it.each(['unpaid', 'partial'] as const)(
    'highlights a bank-transfer order when payment is %s, at any status',
    (paymentStatus) => {
      expect(
        shouldHighlightReadyPayment(
          makeOrder({
            status: 'ready',
            paymentMethod: 'transfer',
            paymentStatus,
          }),
        ),
      ).toBe(true)
      expect(
        shouldHighlightReadyPayment(
          makeOrder({
            status: 'processing',
            paymentMethod: 'transfer',
            paymentStatus,
          }),
        ),
      ).toBe(true)
    },
  )

  it.each(['unpaid', 'partial'] as const)(
    'highlights a cash order when payment is %s, at any status',
    (paymentStatus) => {
      expect(
        shouldHighlightReadyPayment(
          makeOrder({
            status: 'ready',
            paymentMethod: 'cash',
            paymentStatus,
          }),
        ),
      ).toBe(true)
      expect(
        shouldHighlightReadyPayment(
          makeOrder({
            status: 'processing',
            paymentMethod: 'cash',
            paymentStatus,
          }),
        ),
      ).toBe(true)
    },
  )

  it('does not highlight fully paid orders', () => {
    expect(
      shouldHighlightReadyPayment(
        makeOrder({
          status: 'ready',
          paymentMethod: 'transfer',
          paymentStatus: 'paid',
        }),
      ),
    ).toBe(false)
    expect(
      shouldHighlightReadyPayment(
        makeOrder({
          status: 'processing',
          paymentMethod: 'cash',
          paymentStatus: 'paid',
        }),
      ),
    ).toBe(false)
  })

  it('gates ready-to-delivering and ready-to-picked-up transitions for any payment method', () => {
    const transferOrder = makeOrder({
      status: 'ready',
      paymentMethod: 'transfer',
      paymentStatus: 'partial',
    })
    expect(shouldGateOrderAdvanceForPayment(transferOrder, 'delivering')).toBe(true)
    expect(shouldGateOrderAdvanceForPayment(transferOrder, 'picked_up')).toBe(true)
    expect(shouldGateOrderAdvanceForPayment(transferOrder, 'cancelled')).toBe(false)

    const cashOrder = makeOrder({
      status: 'ready',
      paymentMethod: 'cash',
      paymentStatus: 'unpaid',
    })
    expect(shouldGateOrderAdvanceForPayment(cashOrder, 'delivering')).toBe(true)
    expect(shouldGateOrderAdvanceForPayment(cashOrder, 'picked_up')).toBe(true)
  })

  it('calculates unpaid and partial remaining balances', () => {
    expect(
      getRemainingOrderPaymentIdr(
        makeOrder({
          totalIdr: 500_000,
          paymentStatus: 'unpaid',
          paidAmountIdr: 100_000,
        }),
      ),
    ).toBe(500_000)
    expect(
      getRemainingOrderPaymentIdr(
        makeOrder({
          totalIdr: 500_000,
          paymentStatus: 'partial',
          paidAmountIdr: 125_000,
        }),
      ),
    ).toBe(375_000)
  })
})
