import { describe, expect, it } from 'vitest'
import { formatVoucherValue, voucherDiscountIdr } from './voucherDomain'

describe('Rupiah and percent vouchers', () => {
  it('computes a Rupiah voucher, never above the subtotal', () => {
    expect(voucherDiscountIdr({ discountType: 'amount', percentOff: 0, amountOffIdr: 20_000 }, 300_000)).toBe(20_000)
    expect(voucherDiscountIdr({ discountType: 'amount', percentOff: 0, amountOffIdr: 20_000 }, 15_000)).toBe(15_000)
  })
  it('keeps older vouchers (no discountType) as percent', () => {
    expect(voucherDiscountIdr({ percentOff: 10 }, 300_000)).toBe(30_000)
  })
  it('formats both kinds', () => {
    expect(formatVoucherValue({ discountType: 'amount', percentOff: 0, amountOffIdr: 20_000 })).toBe('Rp20.000')
    expect(formatVoucherValue({ percentOff: 15 })).toBe('15%')
  })
})
