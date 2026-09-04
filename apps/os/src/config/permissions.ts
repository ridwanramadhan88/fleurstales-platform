/**
 * @file permissions.ts
 * @description Single source of truth for role-based access to app sections.
 */

import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'

export type AppSection =
  | 'dashboard'
  | 'orders'
  | 'stock'
  | 'catalog'
  | 'customers'
  | 'revenue'
  | 'finance'
  | 'hr'
  | 'scheduling'
  | 'settings'

export type AccessLevel = 'none' | 'view' | 'edit'

export const SECTION_ALLOWED_ROLES: Record<AppSection, UserRole[]> = {
  dashboard: ['owner','admin','finance','hr','florist'],
  orders: ['owner','admin','finance','hr'],
  stock: ['owner','admin','finance'],
  catalog: ['owner','admin','finance'],
  customers: ['owner','admin','finance','hr'],
  revenue: ['owner','finance'],
  finance: ['finance'],
  hr: ['owner','hr'],
  scheduling: ['owner','hr'],
  settings: ['owner'],
}

export const isSectionEligibleForRole = (role: UserRole, section: AppSection): boolean =>
  SECTION_ALLOWED_ROLES[section].includes(role)

export const DEFAULT_ROLE_SECTION_ACCESS: Record<UserRole, Record<AppSection, AccessLevel>> = {
  owner: {
    dashboard: 'edit',
    orders: 'edit',
    stock: 'edit',
    catalog: 'edit',
    customers: 'edit',
    revenue: 'edit',
    finance: 'none',
    hr: 'edit',
    scheduling: 'edit',
    settings: 'edit',
  },
  admin: {
    dashboard: 'edit',
    orders: 'edit',
    stock: 'edit',
    catalog: 'edit',
    customers: 'edit',
    revenue: 'none',
    finance: 'none',
    hr: 'none',
    scheduling: 'none',
    settings: 'none',
  },
  finance: {
    dashboard: 'edit',
    orders: 'view',
    stock: 'view',
    catalog: 'view',
    customers: 'view',
    revenue: 'view',
    finance: 'edit',
    hr: 'none',
    scheduling: 'none',
    settings: 'none',
  },
  hr: {
    dashboard: 'view',
    orders: 'view',
    stock: 'none',
    catalog: 'none',
    customers: 'view',
    revenue: 'none',
    finance: 'none',
    hr: 'edit',
    scheduling: 'edit',
    settings: 'none',
  },
  florist: {
    dashboard: 'view',
    orders: 'none',
    stock: 'none',
    catalog: 'none',
    customers: 'none',
    revenue: 'none',
    finance: 'none',
    hr: 'none',
    scheduling: 'none',
    settings: 'none',
  },
}

export const getAccessLevel = (
  role: UserRole,
  section: AppSection,
  permissions: PermissionMatrix = DEFAULT_ROLE_SECTION_ACCESS,
): AccessLevel => isSectionEligibleForRole(role, section) ? (permissions[role]?.[section] ?? 'none') : 'none'

export const canAccessSection = (
  role: UserRole,
  section: AppSection,
  permissions: PermissionMatrix = DEFAULT_ROLE_SECTION_ACCESS,
): boolean => getAccessLevel(role, section, permissions) !== 'none'

export const canEditSection = (
  role: UserRole,
  section: AppSection,
  permissions: PermissionMatrix = DEFAULT_ROLE_SECTION_ACCESS,
): boolean => getAccessLevel(role, section, permissions) === 'edit'

export const getSectionsForRole = (role: UserRole): AppSection[] => {
  const sections = DEFAULT_ROLE_SECTION_ACCESS[role]
  if (!sections) return []
  return (Object.keys(sections) as AppSection[]).filter((section) => sections[section] !== 'none')
}
