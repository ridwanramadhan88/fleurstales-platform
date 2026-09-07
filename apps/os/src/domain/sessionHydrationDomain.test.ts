import { describe, expect, it } from 'vitest'
import { DEFAULT_ACTION_PERMISSIONS } from '../config/actionPermissions'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import type { SharedSession } from '../data/shared/staffSessionDomain'
import type { PermissionMatrix } from '../types/settings'
import { canHydrateCustomersForRole, resolveAuthoritativeStaffRole, resolveStaffBranchContext } from './sessionHydrationDomain'

describe('resolveAuthoritativeStaffRole', () => {
  it('uses the authenticated Supabase staff profile role over a stale employee role', () => {
    const session: SharedSession = {
      kind: 'staff',
      source: 'supabase',
      userId: 'auth-user',
      employeeId: 'emp-finance',
      displayName: 'Finance User',
      role: 'finance',
      isActive: true,
    }

    expect(resolveAuthoritativeStaffRole('hr', session)).toBe('finance')
  })

  it('keeps the employee role for non-Supabase sessions', () => {
    const session: SharedSession = {
      kind: 'staff',
      source: 'local_demo',
      employeeId: 'emp-local',
      displayName: 'Local User',
      role: 'owner',
      isActive: true,
    }

    expect(resolveAuthoritativeStaffRole('admin', session)).toBe('admin')
  })
})

describe('resolveStaffBranchContext', () => {
  const branches = [
    { id: 'branch-a', isActive: true, isDefault: true },
    { id: 'branch-b', isActive: true, isDefault: false },
    { id: 'branch-retired', isActive: false, isDefault: false },
  ]

  it('lets an unscheduled Admin open the OS at their active profile branch without inventing a schedule', () => {
    expect(resolveStaffBranchContext({
      role: 'admin',
      scheduledBranchId: undefined,
      profileBranchId: 'branch-b',
      branches,
    })).toEqual({
      scheduledBranchId: undefined,
      fallbackOperationalBranchId: 'branch-b',
      requiresOperationalBranch: true,
    })
  })

  it('lets an unscheduled Florist fall back to the default active branch', () => {
    expect(resolveStaffBranchContext({
      role: 'florist',
      scheduledBranchId: undefined,
      profileBranchId: 'branch-retired',
      branches,
    })).toEqual({
      scheduledBranchId: undefined,
      fallbackOperationalBranchId: 'branch-a',
      requiresOperationalBranch: true,
    })
  })

  it('keeps an active scheduled branch separate from the fallback branch', () => {
    expect(resolveStaffBranchContext({
      role: 'admin',
      scheduledBranchId: 'branch-b',
      profileBranchId: 'branch-a',
      branches,
    })).toEqual({
      scheduledBranchId: 'branch-b',
      fallbackOperationalBranchId: 'branch-a',
      requiresOperationalBranch: true,
    })
  })

  it('does not expose an inactive assignment as the current schedule', () => {
    expect(resolveStaffBranchContext({
      role: 'admin',
      scheduledBranchId: 'branch-retired',
      profileBranchId: 'branch-b',
      branches,
    })).toEqual({
      scheduledBranchId: undefined,
      fallbackOperationalBranchId: 'branch-b',
      requiresOperationalBranch: true,
    })
  })

  it('does not require fallback branch context for cross-branch roles', () => {
    expect(resolveStaffBranchContext({
      role: 'finance',
      scheduledBranchId: undefined,
      profileBranchId: 'branch-b',
      branches,
    })).toEqual({
      scheduledBranchId: undefined,
      fallbackOperationalBranchId: 'branch-b',
      requiresOperationalBranch: false,
    })
  })

  it('keeps the explicit no-active-branch failure detectable for branch-scoped roles', () => {
    expect(resolveStaffBranchContext({
      role: 'florist',
      scheduledBranchId: undefined,
      profileBranchId: undefined,
      branches: [{ id: 'branch-retired', isActive: false }],
    })).toEqual({
      scheduledBranchId: undefined,
      fallbackOperationalBranchId: undefined,
      requiresOperationalBranch: true,
    })
  })
})

describe('canHydrateCustomersForRole', () => {
  it('hydrates Finance because Finance can view Customers', () => {
    expect(canHydrateCustomersForRole('finance', DEFAULT_ROLE_SECTION_ACCESS, DEFAULT_ACTION_PERMISSIONS)).toBe(true)
  })

  it('hydrates HR because HR can now view Customers', () => {
    expect(canHydrateCustomersForRole('hr', DEFAULT_ROLE_SECTION_ACCESS, DEFAULT_ACTION_PERMISSIONS)).toBe(true)
  })

  it('hydrates Admin when Customers is hidden but order creation is still allowed', () => {
    const permissions = structuredClone(DEFAULT_ROLE_SECTION_ACCESS) as PermissionMatrix
    permissions.admin.customers = 'none'

    expect(canHydrateCustomersForRole('admin', permissions, DEFAULT_ACTION_PERMISSIONS)).toBe(true)
  })

  it('does not hydrate Admin when both Customers and Orders access are disabled', () => {
    const permissions = structuredClone(DEFAULT_ROLE_SECTION_ACCESS) as PermissionMatrix
    permissions.admin.customers = 'none'
    permissions.admin.orders = 'none'

    expect(canHydrateCustomersForRole('admin', permissions, DEFAULT_ACTION_PERMISSIONS)).toBe(false)
  })
})
