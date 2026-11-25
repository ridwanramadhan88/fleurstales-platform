import { describe, expect, it } from 'vitest'
import { isQrisAmountUpdated, qrisAmountFor } from './qrisPayment'

// Must match private.qris_amount_for (supabase/tests/qris_amount_embedded_smoke.sql).
describe('QRIS amount per order', () => {
  it('ends in the 3-digit daily code without exceeding the bill', () => {
    expect(qrisAmountFor('KDM-26-11-26-007', 330000)).toBe(329007)
    expect(qrisAmountFor('KDM-26-11-26-107', 330500)).toBe(330107)
    expect(qrisAmountFor('PHM-26-11-26-250', 250250)).toBe(250250)
  })

  it('charges small bills, legacy numbers and 4-digit sequences exactly', () => {
    expect(qrisAmountFor('KDM-26-11-26-001', 9999)).toBe(9999)
    expect(qrisAmountFor('KDM-2026-0026', 330000)).toBe(330000)
    expect(qrisAmountFor('KDM-26-11-26-1000', 330000)).toBe(330000)
  })

  it('flags a QR whose bill changed after it was handed out', () => {
    expect(isQrisAmountUpdated({ orderNumber: 'KDM-26-11-26-007', totalIdr: 330000, paidAmountIdr: 0, qrisAmountShown: 329007 })).toBe(false)
    expect(isQrisAmountUpdated({ orderNumber: 'KDM-26-11-26-007', totalIdr: 345000, paidAmountIdr: 0, qrisAmountShown: 329007 })).toBe(true)
    expect(isQrisAmountUpdated({ orderNumber: 'KDM-26-11-26-007', totalIdr: 345000, paidAmountIdr: 0, qrisAmountShown: null })).toBe(false)
  })
})
