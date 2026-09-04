import { describe, expect, it } from 'vitest'
import { canCreateOrderForBranch } from './orderBusinessRules'
import { canManageVouchers } from './voucherAuthorizationDomain'
import { cancelOrderRefund } from './orderRefundDomain'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import { makeOrder } from '../test/factories/order'

describe('focused workflow gap fixes', () => {
  it('allows voucher management only for Owner, Admin, and Finance', () => {
    expect(canManageVouchers('owner')).toBe(true)
    expect(canManageVouchers('admin')).toBe(true)
    expect(canManageVouchers('finance')).toBe(true)
    expect(canManageVouchers('hr')).toBe(false)
    expect(canManageVouchers('florist')).toBe(false)
  })

  it('blocks Florist from creating Orders after Orders access is removed', () => {
    expect(canCreateOrderForBranch({
      actor: { name: 'Florist', role: 'florist', employeeId: 'f1', branchId: 'Kedamaian' },
      branch: 'Kedamaian',
      orderType: 'admin_created',
      permissions: DEFAULT_ROLE_SECTION_ACCESS,
    })).toEqual({ allowed: false, reason: 'Florists cannot create orders.' })
  })

  it('keeps Owner out of the Finance section by default', () => {
    expect(DEFAULT_ROLE_SECTION_ACCESS.owner.finance).toBe('none')
    expect(DEFAULT_ROLE_SECTION_ACCESS.finance.finance).toBe('edit')
  })

  it('allows only Finance to cancel a pending refund and preserves history fields', () => {
    const order = makeOrder({ paymentStatus: 'refund_pending', paidAmountIdr: 100_000, refundAmountIdr: 100_000, refundReason: 'Duplicate', refundInitiatedBy: 'Finance', refundInitiatedAt: '2026-07-14T00:00:00Z' })
    const denied = cancelOrderRefund({
      order,
      actor: { name: 'Owner', role: 'owner' },
      reason: 'Customer asked to continue the Order',
      cancelledAt: '2026-07-14T01:00:00Z',
    })
    expect(denied.allowed).toBe(false)

    const result = cancelOrderRefund({
      order,
      actor: { name: 'Finance', role: 'finance' },
      reason: 'Customer asked to continue the Order',
      cancelledAt: '2026-07-14T01:00:00Z',
    })
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.order).toMatchObject({
      paymentStatus: 'paid',
      refundCancelledBy: 'Finance',
      refundCancellationReason: 'Customer asked to continue the Order',
    })
  })
})