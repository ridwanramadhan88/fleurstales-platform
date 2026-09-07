import { hasActionPermission, type ActionPermissionMatrix } from '../config/actionPermissions'
import { canAccessSection } from '../config/permissions'
import type { SharedSession } from '../data/shared/staffSessionDomain'
import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'

/**
 * Supabase staff access is the production authority for role assignment.
 * Local/shared-backend sessions continue to use the employee record supplied
 * by the login flow.
 */
export const resolveAuthoritativeStaffRole = (
  employeeRole: UserRole,
  session: SharedSession,
): UserRole => session.kind === 'staff' && session.source === 'supabase'
  ? session.role
  : employeeRole

/**
 * Login is an authentication decision, not a scheduling decision. A real
 * working schedule still wins when present, but Admin/Florist may open their
 * operational workspace while unscheduled by falling back to an active profile
 * branch, then the default/first active branch. The fallback never becomes a
 * scheduled branch, so attendance remains schedule-authoritative.
 */
export const resolveStaffBranchContext = ({
  role,
  scheduledBranchId,
  profileBranchId,
  branches,
}: {
  role: UserRole
  scheduledBranchId?: string
  profileBranchId?: string
  branches: Array<{ id: string; isActive: boolean; isDefault?: boolean }>
}): {
  scheduledBranchId?: string
  operationalBranchId?: string
  requiresOperationalBranch: boolean
} => {
  const activeBranches = branches.filter((branch) => branch.isActive)
  const activeIds = new Set(activeBranches.map((branch) => branch.id))
  const activeScheduledBranchId = scheduledBranchId && activeIds.has(scheduledBranchId)
    ? scheduledBranchId
    : undefined
  const activeProfileBranchId = profileBranchId && activeIds.has(profileBranchId)
    ? profileBranchId
    : undefined
  const fallbackOperationalBranchId = activeProfileBranchId
    ?? activeBranches.find((branch) => branch.isDefault)?.id
    ?? activeBranches[0]?.id
  const requiresOperationalBranch = role === 'admin' || role === 'florist'

  return {
    scheduledBranchId: activeScheduledBranchId,
    operationalBranchId: activeScheduledBranchId
      ?? (requiresOperationalBranch ? fallbackOperationalBranchId : undefined),
    requiresOperationalBranch,
  }
}

/**
 * Customer data is needed by anyone who can open the Customers workspace,
 * plus staff who can create orders because the order workflow resolves
 * customer records even when the Customers section itself is hidden.
 */
export const canHydrateCustomersForRole = (
  role: UserRole,
  permissions: PermissionMatrix,
  actionPermissions: ActionPermissionMatrix,
): boolean => canAccessSection(role, 'customers', permissions)
  || hasActionPermission(role, 'orders.create', actionPermissions, permissions)
