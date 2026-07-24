import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLE_SECTION_ACCESS } from './permissions'
import {
  NAVIGATION_DESTINATION_ORDER,
  getAccessibleNavigationDestinationIds,
  getNavigationDestinationLabel,
  getNavigationGroupsForDestinations,
} from './navigationGroups'
import {
  getPrimaryMobileDestinationIds,
  getSecondaryMobileDestinationIds,
} from './mobileNavigation'
import type { PermissionMatrix } from '../types/settings'

const clonePermissions = (): PermissionMatrix =>
  structuredClone(DEFAULT_ROLE_SECTION_ACCESS)

describe('navigation grouping', () => {
  it('keeps every existing top-level destination in one stable grouped order', () => {
    expect(NAVIGATION_DESTINATION_ORDER).toEqual([
      'dashboard',
      'orders',
      'customers',
      'catalog',
      'stock',
      'finance',
      'revenue',
      'hr',
      'settings',
    ])
    expect(new Set(NAVIGATION_DESTINATION_ORDER).size).toBe(
      NAVIGATION_DESTINATION_ORDER.length,
    )
  })

  it('returns only non-empty groups and preserves group ordering', () => {
    expect(
      getNavigationGroupsForDestinations([
        'settings',
        'orders',
        'finance',
        'customers',
      ]).map((group) => ({
        id: group.id,
        destinations: group.destinations,
      })),
    ).toEqual([
      { id: 'operations', destinations: ['orders', 'customers'] },
      { id: 'finance', destinations: ['finance'] },
      { id: 'management', destinations: ['settings'] },
    ])
  })

  it('filters destinations through existing access settings before grouping', () => {
    const permissions = clonePermissions()
    permissions.admin.finance = 'none'
    permissions.admin.revenue = 'none'

    expect(
      getAccessibleNavigationDestinationIds({
        role: 'admin',
        permissions,
        inventoryEnabled: true,
      }),
    ).toEqual(['dashboard', 'orders', 'customers', 'catalog', 'stock'])
  })

  it('keeps Inventory controlled by its feature toggle without changing stock access', () => {
    const permissions = clonePermissions()

    expect(
      getAccessibleNavigationDestinationIds({
        role: 'owner',
        permissions,
        inventoryEnabled: false,
      }),
    ).not.toContain('stock')

    expect(permissions.owner.stock).toBe('edit')
  })

  it('shows the People workspace when scheduling access exists without HR access', () => {
    const permissions = clonePermissions()
    permissions.hr.hr = 'none'
    permissions.hr.scheduling = 'view'

    expect(
      getAccessibleNavigationDestinationIds({
        role: 'hr',
        permissions,
        inventoryEnabled: false,
      }),
    ).toContain('hr')
  })

  it('can preserve specialist desktop landing behavior without changing permissions', () => {
    const permissions = clonePermissions()

    const visible = getAccessibleNavigationDestinationIds({
      role: 'finance',
      permissions,
      inventoryEnabled: true,
      includeDashboard: false,
    })

    expect(visible).not.toContain('dashboard')
    expect(permissions.finance.dashboard).toBe('edit')
  })

  it('keeps the mobile primary bar capped at four and excludes it from workspace', () => {
    const accessible = [...NAVIGATION_DESTINATION_ORDER]
    const primary = getPrimaryMobileDestinationIds('owner', accessible)
    const secondary = getSecondaryMobileDestinationIds('owner', accessible)

    expect(primary).toEqual(['dashboard', 'orders', 'hr', 'customers'])
    expect(primary).toHaveLength(4)
    expect(secondary.some((id) => primary.includes(id))).toBe(false)
    expect([...primary, ...secondary].sort()).toEqual([...accessible].sort())
  })


  it('keeps Overview reachable for specialist roles that depend on Workspace links', () => {
    const accessible = [...NAVIGATION_DESTINATION_ORDER]

    expect(getPrimaryMobileDestinationIds('finance', accessible)).toEqual([
      'dashboard',
      'finance',
      'revenue',
      'orders',
    ])
    expect(getPrimaryMobileDestinationIds('hr', accessible)).toEqual([
      'dashboard',
      'hr',
      'orders',
      'customers',
    ])
  })

  it('does not reintroduce inaccessible or disabled destinations', () => {
    const accessible = ['dashboard', 'orders', 'catalog', 'customers'] as const
    const primary = getPrimaryMobileDestinationIds('admin', accessible)
    const secondary = getSecondaryMobileDestinationIds('admin', accessible)

    expect(primary).toEqual(['dashboard', 'orders', 'customers', 'catalog'])
    expect(secondary).toEqual([])
    expect([...primary, ...secondary]).not.toContain('stock')
    expect([...primary, ...secondary]).not.toContain('settings')
  })

  it('keeps destination labels centralized per surface without changing route IDs', () => {
    expect(getNavigationDestinationLabel('finance', 'finance', 'desktop')).toBe(
      'Order Verification',
    )
    expect(getNavigationDestinationLabel('finance', 'owner', 'workspace')).toBe(
      'Finance',
    )
    expect(getNavigationDestinationLabel('dashboard', 'admin', 'mobile-bottom')).toBe(
      'Today',
    )
  })
})
