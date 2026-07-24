import { canAccessSection, type AppSection } from './permissions'
import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'

export type NavigationGroupId =
  | 'overview'
  | 'operations'
  | 'finance'
  | 'people'
  | 'management'

export type NavigationDestinationId =
  | 'dashboard'
  | 'orders'
  | 'finance'
  | 'hr'
  | 'catalog'
  | 'stock'
  | 'customers'
  | 'revenue'
  | 'settings'

export type NavigationSurface = 'desktop' | 'mobile-bottom' | 'workspace'

export interface NavigationDestinationDefinition {
  id: NavigationDestinationId
  groupId: NavigationGroupId
  label: string
  section: AppSection
  requiresInventory?: boolean
}

export interface NavigationGroupDefinition {
  id: NavigationGroupId
  label: string
}

/**
 * Presentation-only information architecture for the existing top-level routes.
 * Access still comes from the Owner-controlled permission matrix and feature
 * toggles; groups never grant access by themselves.
 */
export const NAVIGATION_GROUPS: readonly NavigationGroupDefinition[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'operations', label: 'Operations' },
  { id: 'finance', label: 'Finance' },
  { id: 'people', label: 'People' },
  { id: 'management', label: 'Management' },
]

/**
 * One master list of existing top-level destinations. Internal Finance,
 * People, and Settings tabs remain owned by their current workspaces.
 */
export const NAVIGATION_DESTINATIONS: readonly NavigationDestinationDefinition[] = [
  { id: 'dashboard', groupId: 'overview', label: 'Overview', section: 'dashboard' },
  { id: 'orders', groupId: 'operations', label: 'Orders', section: 'orders' },
  { id: 'customers', groupId: 'operations', label: 'Customers', section: 'customers' },
  { id: 'catalog', groupId: 'operations', label: 'Catalog', section: 'catalog' },
  {
    id: 'stock',
    groupId: 'operations',
    label: 'Inventory',
    section: 'stock',
    requiresInventory: true,
  },
  { id: 'finance', groupId: 'finance', label: 'Finance', section: 'finance' },
  { id: 'revenue', groupId: 'finance', label: 'Revenue', section: 'revenue' },
  { id: 'hr', groupId: 'people', label: 'People', section: 'hr' },
  { id: 'settings', groupId: 'management', label: 'Settings', section: 'settings' },
]

export const NAVIGATION_DESTINATION_ORDER: readonly NavigationDestinationId[] =
  NAVIGATION_DESTINATIONS.map((destination) => destination.id)

const DESTINATION_BY_ID = new Map(
  NAVIGATION_DESTINATIONS.map((destination) => [destination.id, destination]),
)

export const getNavigationDestination = (
  id: NavigationDestinationId,
): NavigationDestinationDefinition => {
  const destination = DESTINATION_BY_ID.get(id)
  if (!destination) throw new Error(`Unknown navigation destination: ${id}`)
  return destination
}

export const getNavigationDestinationLabel = (
  id: NavigationDestinationId,
  role: UserRole,
  surface: NavigationSurface,
): string => {
  if (id === 'dashboard') {
    if (role === 'florist') return 'My Work'
    if (role === 'admin') return surface === 'desktop' ? "Today's Operations" : 'Today'
    return surface === 'desktop' ? 'Business Overview' : 'Overview'
  }

  if (id === 'finance') {
    if (surface === 'workspace') return 'Finance'
    if (role === 'finance') return surface === 'mobile-bottom' ? 'Verify' : 'Order Verification'
    return surface === 'mobile-bottom' ? 'Collect' : 'Payment Verification'
  }

  if (id === 'hr' && surface === 'desktop') return 'People & Attendance'

  return getNavigationDestination(id).label
}

export interface NavigationAccessContext {
  role: UserRole
  permissions: PermissionMatrix
  inventoryEnabled: boolean
  includeDashboard?: boolean
}

/**
 * Applies the existing permission matrix and feature toggles before grouping.
 * This function never changes access settings; it only reports which existing
 * top-level destinations are already allowed for the current session.
 */
export const getAccessibleNavigationDestinationIds = ({
  role,
  permissions,
  inventoryEnabled,
  includeDashboard = true,
}: NavigationAccessContext): NavigationDestinationId[] =>
  NAVIGATION_DESTINATIONS.filter((destination) => {
    if (role === 'admin' && (destination.id === 'finance' || destination.id === 'revenue')) return false
    if (destination.id === 'dashboard' && !includeDashboard) return false
    if (destination.requiresInventory && !inventoryEnabled) return false

    if (destination.id === 'hr') {
      return (
        canAccessSection(role, 'hr', permissions) ||
        canAccessSection(role, 'scheduling', permissions)
      )
    }

    return canAccessSection(role, destination.section, permissions)
  }).map((destination) => destination.id)

export const getNavigationGroupsForDestinations = (
  destinationIds: readonly NavigationDestinationId[],
): Array<NavigationGroupDefinition & { destinations: NavigationDestinationId[] }> => {
  const allowed = new Set(destinationIds)

  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    destinations: NAVIGATION_DESTINATIONS.filter(
      (destination) => destination.groupId === group.id && allowed.has(destination.id),
    ).map((destination) => destination.id),
  })).filter((group) => group.destinations.length > 0)
}
