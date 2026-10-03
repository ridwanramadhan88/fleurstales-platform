/**
 * @file accessPresetDomain.ts
 * @description Access settings start from each role's preset (the built-in
 * defaults). This lists only where a role differs from its preset, so the
 * owner sees exceptions instead of 35 switches, and can put them back.
 * Display and editing help only: how access is enforced does not change.
 */

import { CAPABILITY_REGISTRY, DEFAULT_ACTION_PERMISSIONS, type ActionCapability, type ActionPermissionMatrix } from '../config/actionPermissions'
import { DEFAULT_ROLE_SECTION_ACCESS, type AccessLevel, type AppSection } from '../config/permissions'
import type { PermissionMatrix } from '../types/settings'
import type { UserRole } from '../store/userStore'

export type AccessException =
  | { kind: 'section'; section: AppSection; preset: AccessLevel; current: AccessLevel }
  | { kind: 'action'; capability: ActionCapability; label: string; preset: boolean; current: boolean }

export const getAccessExceptions = (
  role: UserRole,
  permissions: PermissionMatrix,
  actionPermissions: ActionPermissionMatrix,
): AccessException[] => {
  const sectionPreset = DEFAULT_ROLE_SECTION_ACCESS[role]
  const sections = (Object.keys(sectionPreset) as AppSection[])
    .filter((section) => (permissions[role]?.[section] ?? 'none') !== sectionPreset[section])
    .map((section): AccessException => ({
      kind: 'section',
      section,
      preset: sectionPreset[section],
      current: permissions[role]?.[section] ?? 'none',
    }))
  const actions = CAPABILITY_REGISTRY
    .filter((item) => Boolean(actionPermissions[role]?.[item.id]) !== Boolean(DEFAULT_ACTION_PERMISSIONS[role][item.id]))
    .map((item): AccessException => ({
      kind: 'action',
      capability: item.id,
      label: item.label,
      preset: Boolean(DEFAULT_ACTION_PERMISSIONS[role][item.id]),
      current: Boolean(actionPermissions[role]?.[item.id]),
    }))
  return [...sections, ...actions]
}

/**
 * Puts one role back on its preset through the normal edit callbacks, so the
 * usual guards and the Save step still apply. Sections go first because an
 * action can only be on inside a section the role can open.
 */
export const restoreRolePreset = (
  role: UserRole,
  exceptions: AccessException[],
  update: {
    section: (role: UserRole, section: AppSection, level: AccessLevel) => void
    action: (role: UserRole, capability: ActionCapability, enabled: boolean) => void
  },
): void => {
  for (const item of exceptions) if (item.kind === 'section') update.section(role, item.section, item.preset)
  for (const item of exceptions) if (item.kind === 'action') update.action(role, item.capability, item.preset)
}
