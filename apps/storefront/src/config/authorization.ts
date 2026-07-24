import type { UserRole } from '../store/userStore'
import { useSettingsStore } from '../store/settingsStore'
import { hasActionPermission, type ActionCapability } from './actionPermissions'
import { canEditSection, type AppSection } from './permissions'
import { useUserStore } from '../store/userStore'

/**
 * Authoritative action authorization for command/store boundaries.
 * UI visibility is only a convenience; mutations must call this resolver.
 */
export const isActionAuthorized = (role: UserRole, capability: ActionCapability): boolean => {
  const settings = useSettingsStore.getState()
  return hasActionPermission(role, capability, settings.actionPermissions, settings.permissions)
}

/** Authoritative section-level edit guard for stores without row-level rules. */
export const isSectionEditAuthorized = (section: AppSection): boolean => {
  const role = useUserStore.getState().role
  const permissions = useSettingsStore.getState().permissions
  return canEditSection(role, section, permissions)
}
