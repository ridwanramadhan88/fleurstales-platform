import { describe, expect, it } from 'vitest'
import { CAPABILITY_REGISTRY, DEFAULT_ACTION_PERMISSIONS, hasActionPermission } from './actionPermissions'
import { canAccessSection, canEditSection, DEFAULT_ROLE_SECTION_ACCESS } from './permissions'
import { isOrderInActorRowScope } from '../domain/orderAuthorizationDomain'
import type { OrderTableRow } from '../types/orders'

describe('manager role (operations manager)', () => {
  it('opens florist work, all orders (read-only), catalog editing and customers', () => {
    expect(canAccessSection('manager', 'dashboard')).toBe(true)
    expect(canAccessSection('manager', 'orders')).toBe(true)
    expect(canEditSection('manager', 'orders')).toBe(false)
    expect(canEditSection('manager', 'catalog')).toBe(true)
    expect(canAccessSection('manager', 'customers')).toBe(true)
    for (const section of ['finance', 'revenue', 'hr', 'scheduling', 'settings'] as const) {
      expect(DEFAULT_ROLE_SECTION_ACCESS.manager[section]).toBe('none')
    }
  })

  it('only holds the two read capabilities', () => {
    const enabled = CAPABILITY_REGISTRY
      .filter((definition) => hasActionPermission('manager', definition.id, DEFAULT_ACTION_PERMISSIONS, DEFAULT_ROLE_SECTION_ACCESS))
      .map((definition) => definition.id)
    expect(enabled).toEqual(['orders.read_all', 'orders.read_assigned'])
  })

  it('sees orders of every florist and branch', () => {
    const order = { floristAssignedEmployeeId: 'emp-other', branch: 'Pahoman' } as OrderTableRow
    expect(isOrderInActorRowScope(order, { role: 'manager', employeeId: 'emp-manager', name: 'Manajer' })).toBe(true)
    expect(isOrderInActorRowScope(order, { role: 'florist', employeeId: 'emp-florist', name: 'Florist' })).toBe(false)
  })
})
