import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import { makeOrder } from '../test/factories/order'
import { authorizeOrderMutation, canViewOrder } from './orderAuthorizationDomain'

describe('order row-level authorization', () => {
  const kedamaianOrder = makeOrder({
    orderNumber: 'KDM-1',
    branch: 'Kedamaian',
    floristAssignedEmployeeId: 'florist-a',
    adminHandledEmployeeId: 'admin-a',
  })

  it('limits branch-scoped Admin access while keeping Owner and Finance cross-branch', () => {
    expect(
      canViewOrder(
        kedamaianOrder,
        { employeeId: 'admin-b', name: 'Admin B', role: 'admin', branchId: 'Pahoman' },
        DEFAULT_ROLE_SECTION_ACCESS,
      ),
    ).toBe(false)

    expect(
      canViewOrder(
        kedamaianOrder,
        { employeeId: 'owner-a', name: 'Owner', role: 'owner', branchId: 'Pahoman' },
        DEFAULT_ROLE_SECTION_ACCESS,
      ),
    ).toBe(true)

    expect(
      canViewOrder(
        kedamaianOrder,
        { employeeId: 'finance-a', name: 'Finance', role: 'finance' },
        DEFAULT_ROLE_SECTION_ACCESS,
      ),
    ).toBe(true)
  })


  it('denies branch-scoped staff when no active branch assignment exists', () => {
    expect(
      canViewOrder(
        kedamaianOrder,
        { employeeId: 'admin-off-shift', name: 'Admin Off Shift', role: 'admin' },
        DEFAULT_ROLE_SECTION_ACCESS,
      ),
    ).toBe(false)

    expect(
      authorizeOrderMutation({
        order: kedamaianOrder,
        actor: { employeeId: 'admin-off-shift', name: 'Admin Off Shift', role: 'admin' },
        permissions: DEFAULT_ROLE_SECTION_ACCESS,
        kind: 'status',
      }),
    ).toMatchObject({ allowed: false })
  })

  it('removes Orders visibility from Florists', () => {
    expect(
      canViewOrder(
        kedamaianOrder,
        { employeeId: 'florist-a', name: 'Florist A', role: 'florist', branchId: 'Kedamaian' },
        DEFAULT_ROLE_SECTION_ACCESS,
      ),
    ).toBe(false)
    expect(
      canViewOrder(
        kedamaianOrder,
        { employeeId: 'florist-b', name: 'Florist B', role: 'florist', branchId: 'Kedamaian' },
        DEFAULT_ROLE_SECTION_ACCESS,
      ),
    ).toBe(false)
  })


  it('denies direct mutations outside the actor row scope', () => {
    expect(
      authorizeOrderMutation({
        order: kedamaianOrder,
        actor: { employeeId: 'admin-b', name: 'Admin B', role: 'admin', branchId: 'Pahoman' },
        permissions: DEFAULT_ROLE_SECTION_ACCESS,
        kind: 'details',
      }),
    ).toMatchObject({ allowed: false })
  })
})
