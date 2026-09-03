import { hasActionPermission, type ActionPermissionMatrix } from '../config/actionPermissions'
import { canAccessSection } from '../config/permissions'
import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'

export interface CustomerHydrationAuthorization {
  role: UserRole
  permissions: PermissionMatrix
  actionPermissions: ActionPermissionMatrix
}

export const canHydrateBusinessOsCustomers = ({
  role,
  permissions,
  actionPermissions,
}: CustomerHydrationAuthorization): boolean =>
  canAccessSection(role, 'customers', permissions) ||
  hasActionPermission(role, 'orders.create', actionPermissions, permissions)

export const hydrateBusinessOsCustomersIfAuthorized = async (
  authorization: CustomerHydrationAuthorization,
  hydrate: () => Promise<boolean>,
): Promise<boolean> =>
  canHydrateBusinessOsCustomers(authorization) ? hydrate() : true
