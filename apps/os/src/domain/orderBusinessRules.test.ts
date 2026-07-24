import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import type { OrderTableRow } from '../types/orders'
import {
  canCreateOrderForBranch,
  canPrepareFinanceResubmission,
  getAdminHandlerEmployeeId,
} from './orderBusinessRules'

const order = {
  orderNumber: 'KDM-2026-001',
  branch: 'Kedamaian',
  financeVerificationStatus: 'rejected',
  floristAssignedEmployeeId: 'florist-1',
} as OrderTableRow

describe('order business-rule gateway', () => {
  it('allows Admin order creation only inside the assigned branch', () => {
    const actor = { employeeId: 'admin-1', name: 'Admin', role: 'admin' as const, branchId: 'Kedamaian' }
    expect(canCreateOrderForBranch({ actor, branch: 'Kedamaian', orderType: 'admin_created', permissions: DEFAULT_ROLE_SECTION_ACCESS })).toEqual({ allowed: true })
    expect(canCreateOrderForBranch({ actor, branch: 'Pahoman', orderType: 'admin_created', permissions: DEFAULT_ROLE_SECTION_ACCESS })).toMatchObject({ allowed: false })
  })


  it('blocks Admin order creation when no active branch assignment exists', () => {
    const actor = { employeeId: 'admin-off', name: 'Admin Off Shift', role: 'admin' as const }
    expect(canCreateOrderForBranch({ actor, branch: 'Kedamaian', orderType: 'admin_created', permissions: DEFAULT_ROLE_SECTION_ACCESS })).toMatchObject({
      allowed: false,
      reason: 'No active branch assignment was found for your shift.',
    })
  })

  it('does not apply staff creation restrictions to public storefront orders', () => {
    const actor = { name: 'Storefront', role: 'florist' as const }
    expect(canCreateOrderForBranch({ actor, branch: 'Pahoman', orderType: 'customer_created', permissions: DEFAULT_ROLE_SECTION_ACCESS })).toEqual({ allowed: true })
  })

  it('uses one rule for Finance resubmission visibility', () => {
    expect(canPrepareFinanceResubmission(order, 'admin')).toBe(true)
    expect(canPrepareFinanceResubmission(order, 'owner')).toBe(true)
    expect(canPrepareFinanceResubmission(order, 'finance')).toBe(false)
  })

  it('centralizes Admin-handler attribution', () => {
    expect(getAdminHandlerEmployeeId({ role: 'admin', employeeId: 'admin-1' })).toBe('admin-1')
    expect(getAdminHandlerEmployeeId({ role: 'florist', employeeId: 'florist-1' })).toBeUndefined()
    expect(getAdminHandlerEmployeeId({ role: 'finance', employeeId: 'finance-1' })).toBeUndefined()
  })
})
