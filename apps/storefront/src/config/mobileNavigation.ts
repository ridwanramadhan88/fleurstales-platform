import type { UserRole } from '../store/userStore'
import {
  NAVIGATION_DESTINATION_ORDER,
  type NavigationDestinationId,
} from './navigationGroups'

/** Kept as a compatibility alias for the mobile navigation components. */
export type MobileNavigationDestination = NavigationDestinationId

const ROLE_PRIMARY_PRIORITY: Record<UserRole, readonly MobileNavigationDestination[]> = {
  owner: ['dashboard', 'orders', 'hr', 'customers'],
  admin: ['dashboard', 'orders', 'customers', 'catalog'],
  // Overview must stay reachable because it hosts secondary Workspace links.
  finance: ['dashboard', 'finance', 'revenue', 'orders'],
  hr: ['dashboard', 'hr', 'orders', 'customers'],
  florist: ['dashboard', 'orders', 'catalog', 'customers'],
}

export const MOBILE_DESTINATION_ORDER = NAVIGATION_DESTINATION_ORDER

export const getPrimaryMobileDestinationIds = (
  role: UserRole,
  accessibleIds: readonly MobileNavigationDestination[],
): MobileNavigationDestination[] => {
  const accessible = new Set(accessibleIds)
  const rolePriority = ROLE_PRIMARY_PRIORITY[role].filter((id) => accessible.has(id))

  if (rolePriority.length >= 4) return rolePriority.slice(0, 4)

  const fallbacks = MOBILE_DESTINATION_ORDER.filter(
    (id) => accessible.has(id) && !rolePriority.includes(id),
  )

  return [...rolePriority, ...fallbacks].slice(0, 4)
}

export const getSecondaryMobileDestinationIds = (
  role: UserRole,
  accessibleIds: readonly MobileNavigationDestination[],
): MobileNavigationDestination[] => {
  const primary = new Set(getPrimaryMobileDestinationIds(role, accessibleIds))
  return MOBILE_DESTINATION_ORDER.filter(
    (id) => accessibleIds.includes(id) && !primary.has(id),
  )
}
