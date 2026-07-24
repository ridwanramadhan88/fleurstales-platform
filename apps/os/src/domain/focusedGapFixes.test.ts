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

  it('gives Owner edit access to every section by default', () => {
    expect(Object.values(DEFAULT_ROLE_SECTION_ACCESS.owner).every((level) => level === 'edit')).toBe(true)
  })

  it('cancels only a pending Refund and returns payment to Paid while preserving history fields', () => {
    const result = cancelOrderRefund({
      order: makeOrder({ paymentStatus: 'refund_pending', paidAmountIdr: 100_000, refundAmountIdr: 100_000, refundReason: 'Duplicate', refundInitiatedBy: 'Finance', refundInitiatedAt: '2026-07-14T00:00:00Z' }),
      actor: { name: 'Owner', role: 'owner' },
      reason: 'Customer asked to continue the Order',
      cancelledAt: '2026-07-14T01:00:00Z',
    })
    expect(result.allowed).toBe(true)
    if (result.allowed) expect(result.order).toMatchObject({
      paymentStatus: 'paid',
      refundCancelledBy: 'Owner',
      refundCancellationReason: 'Customer asked to continue the Order',
    })
  })
})
