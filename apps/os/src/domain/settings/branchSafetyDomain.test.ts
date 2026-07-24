import { describe, expect, it } from 'vitest'
import { buildBranchDependencyImpacts, normalizeDefaultBranch } from './branchSafetyDomain'
import type { BranchSettings } from '../../types/settings'

const branches: BranchSettings[] = [
  { id:'a', name:'A', code:'AAA', address:'', phone:'', isActive:true, isDefault:true },
  { id:'b', name:'B', code:'BBB', address:'', phone:'', isActive:true },
]

describe('branch safety domain', () => {
  it('clears legacy default-branch flags', () => {
    const normalized = normalizeDefaultBranch(branches.map((branch) => ({ ...branch, isDefault:false })))
    expect(normalized.filter((branch) => branch.isDefault)).toHaveLength(0)
  })

  it('blocks deactivation when active dependencies exist and locks code after order use', () => {
    const impacts = buildBranchDependencyImpacts({
      branches,
      employeeDefaultSchedules: [],
      scheduleOverrides: [],
      orders: [{ orderNumber:'AAA-1', customerName:'C', source:'walk_in', fulfillment:'pickup', status:'confirmed', totalIdr:1, branch:'a', paymentStatus:'unpaid', createdAtLabel:'now' }],
      stockItems: [],
      stockTransfers: [],
      today:'2026-07-11',
    })
    expect(impacts.a.canDeactivate).toBe(false)
    expect(impacts.a.codeLocked).toBe(true)
    expect(impacts.a.activeEmployees).toBe(0)
    expect(impacts.a.activeOrders).toBe(1)
  })

  it('allows deactivation for an unused non-default branch', () => {
    const impacts = buildBranchDependencyImpacts({
      branches,
      employeeDefaultSchedules: [], scheduleOverrides: [], orders: [], stockItems: [], stockTransfers: [],
    })
    expect(impacts.b.canDeactivate).toBe(true)
    expect(impacts.b.canDelete).toBe(true)
  })
})
