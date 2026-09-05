import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import { getAccessibleNavigationDestinationIds } from '../config/navigationGroups'
import {
  getPrimaryMobileDestinationIds,
  getSecondaryMobileDestinationIds,
} from '../config/mobileNavigation'
import { canCreateOrderForBranch } from '../domain/orderBusinessRules'
import { canViewOrder } from '../domain/orderAuthorizationDomain'
import type { UserRole } from '../store/userStore'
import { makeOrder } from '../test/factories/order'

const roles: UserRole[] = ['owner', 'admin', 'finance', 'hr', 'florist']

describe('UX integrity regression matrix', () => {
  it.each(roles)('keeps every accessible destination reachable exactly once for %s', (role) => {
    const accessible = getAccessibleNavigationDestinationIds({
      role,
      permissions: DEFAULT_ROLE_SECTION_ACCESS,
      inventoryEnabled: true,
    })
    const primary = getPrimaryMobileDestinationIds(role, accessible)
    const secondary = getSecondaryMobileDestinationIds(role, accessible)

    expect(primary.length).toBeLessThanOrEqual(4)
    expect(primary.every((id) => accessible.includes(id))).toBe(true)
    expect(secondary.every((id) => accessible.includes(id))).toBe(true)
    expect(secondary.some((id) => primary.includes(id))).toBe(false)
    expect([...primary, ...secondary].sort()).toEqual([...accessible].sort())
  })

  it('keeps Admin reads company-wide while mutations stay blocked without a current assignment', () => {
    const order = makeOrder({ branch: 'Kedamaian', orderNumber: 'KDM-OFF-SHIFT' })
    const actor = { employeeId: 'admin-off', name: 'Admin Off Shift', role: 'admin' as const }

    expect(canViewOrder(order, actor, DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canCreateOrderForBranch({
      actor,
      branch: 'Kedamaian',
      orderType: 'admin_created',
      permissions: DEFAULT_ROLE_SECTION_ACCESS,
    })).toEqual({
      allowed: false,
      reason: 'No active branch assignment was found for your shift.',
    })
  })

  it('keeps Owner, Admin, Finance, and HR company-wide for reads while Admin creation stays branch-scoped', () => {
    const order = makeOrder({ branch: 'Pahoman', orderNumber: 'PHM-SCOPE' })
    const admin = {
      employeeId: 'admin-kdm',
      name: 'Admin Kedamaian',
      role: 'admin' as const,
      branchId: 'Kedamaian',
    }

    expect(canViewOrder(order, { name: 'Owner', role: 'owner' }, DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canViewOrder(order, { name: 'Finance', role: 'finance' }, DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canViewOrder(order, { name: 'HR', role: 'hr' }, DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canViewOrder(order, admin, DEFAULT_ROLE_SECTION_ACCESS)).toBe(true)
    expect(canCreateOrderForBranch({
      actor: admin,
      branch: 'Pahoman',
      orderType: 'admin_created',
      permissions: DEFAULT_ROLE_SECTION_ACCESS,
    })).toEqual({
      allowed: false,
      reason: 'You cannot create an order outside your assigned branch.',
    })
  })
})