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
