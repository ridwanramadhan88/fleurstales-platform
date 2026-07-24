/**
 * @file permissions.ts
 * @description Single source of truth for role-based access to app sections.
 * Navigation (sidebar, bottom tab bar) and page-level guards should all read
 * from this file instead of re-implementing role checks locally.
 *
 * This matrix controls coarse section visibility and editability. Detailed
 * feature actions are controlled separately by `actionPermissions.ts`, and
 * domain rules still enforce row, branch, workflow, and record-state limits.
 *
 * Orders now add a second, row-level authorization layer in
 * domain/orderBusinessRules.ts. Section access remains the coarse
 * navigation capability; order queries and commands additionally enforce
 * branch and employee assignment scope.
 */

import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'

/**
 * @description Identifiers for every distinct section/portal in the app.
 * Sections not yet built (finance, hr) are included now so the access model
 * doesn't need to change shape when those portals ship.
 */
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

/**
 * @description Graded access a role can have to a given section.
 * - 'none': section is hidden entirely (no nav entry, no route).
 * - 'view': section is visible/readable, but all mutating actions
 *   (create/edit/delete, approve, etc.) must be disabled in the UI.
 * - 'edit': full read/write access.
 *
 * Section Access is the first permission layer. Detailed Feature Access is
 * the second layer and can disable individual actions inside an enabled
 * section. Owner defaults to `edit` across all sections, but individual
 * features can still be turned off in Settings to keep the workflow clean.
 */
export type AccessLevel = 'none' | 'view' | 'edit'

/**
 * @description Access level each role has for every section, matching the
 * product access matrix (Owner / Finance / HRD / Admin / Florist columns).
 * Every role must define every section explicitly — no implicit fallback —
 * so adding a new section forces a conscious decision for each role.
 */
/**
 * @description Default role → section access matrix. Exported so the Owner
 * Settings Center (permission matrix panel) can seed its editable copy from
 * this, and so the app has a safe static fallback if the settings store is
 * ever unavailable. `settings` is intentionally owner-only: only Owner can
 * see/edit the Settings Center itself.
 */
export const DEFAULT_ROLE_SECTION_ACCESS: Record<UserRole, Record<AppSection, AccessLevel>> = {
  owner: {
    dashboard: 'edit',
    orders: 'edit',
    stock: 'edit',
    catalog: 'edit',
    customers: 'edit',
    revenue: 'edit',
    finance: 'edit',
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
    // Finance can now view the general Orders table read-only (decided
    // 2026-07-10) — mutating order actions still only happen through the
    // verification queue (OrderTransactionVerificationQueue), gated by
    // canVerifyOrder / canResolveChangeRequest in orderWorkflowDomain.ts,
    // not by this 'view' grade.
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
    orders: 'none',
    stock: 'none',
    catalog: 'none',
    customers: 'none',
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

/**
 * @description Returns the access level a role has for a given section.
 * Defaults to 'none' if the role or section is somehow unrecognized.
 */
export const getAccessLevel = (
  role: UserRole,
  section: AppSection,
  permissions: PermissionMatrix = DEFAULT_ROLE_SECTION_ACCESS,
): AccessLevel => permissions[role]?.[section] ?? 'none'

/**
 * @description Returns whether a role can see a section at all (view or edit).
 * Use this to gate navigation entries and route rendering.
 */
export const canAccessSection = (
  role: UserRole,
  section: AppSection,
  permissions: PermissionMatrix = DEFAULT_ROLE_SECTION_ACCESS,
): boolean => getAccessLevel(role, section, permissions) !== 'none'

/**
 * @description Returns whether a role has full read/write access to a section.
 * Use this to gate mutating actions/controls (buttons, forms, approvals)
 * within a section that the role can otherwise only view.
 */
export const canEditSection = (
  role: UserRole,
  section: AppSection,
  permissions: PermissionMatrix = DEFAULT_ROLE_SECTION_ACCESS,
): boolean => getAccessLevel(role, section, permissions) === 'edit'

/**
 * @description Returns the full list of sections visible to a role
 * (view or edit access), in the fixed section order above.
 */
export const getSectionsForRole = (role: UserRole): AppSection[] => {
  const sections = DEFAULT_ROLE_SECTION_ACCESS[role]
  if (!sections) return []
  return (Object.keys(sections) as AppSection[]).filter(
    (section) => sections[section] !== 'none',
  )
}
