/**
 * @file settingsStore.ts
 * @description Owner Settings Center store. Source of truth for
 * owner-configurable business config — Phase 1 covers store profile and
 * branches; later phases extend this with staff/roles, permissions, order
 * workflow, finance rules, payment methods, florists, and dashboard revenue
 * display settings, per the Phase 1 wiring brief.
 *
 * The Zustand store remains the frontend state container. Durable prototype
 * persistence is handled by the local API and SQLite backend.
 */

import { create } from 'zustand'
import type {
  BranchSettings,
  OwnerSettingsStateValue,
  PermissionMatrix,
  StaffRoleSettings,
  StoreProfileSettings,
  SettingsSectionId,
  SettingsSectionValueMap,
  PayrollDefaultSettings,
  SchedulingSettings,
} from '../types/settings'
import type { AccessLevel, AppSection } from '../config/permissions'
import { DEFAULT_ACTION_PERMISSIONS, guardActionPermissions, hasActionPermission, type ActionCapability, type ActionPermissionMatrix } from '../config/actionPermissions'
import type { UserRole } from './userStore'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'
import { closePreviousRevision, resolveEffectiveRevision, type PayrollSettingsRevision, type SchedulingSettingsRevision } from '../domain/settings/effectiveSettingsDomain'
import { normalizeBankAccounts } from '../domain/settings/paymentMethodSettingsDomain'

interface SettingsStoreState extends OwnerSettingsStateValue {
  actionPermissions: ActionPermissionMatrix
  payrollConfigRevisions: PayrollSettingsRevision[]
  schedulingConfigRevisions: SchedulingSettingsRevision[]
  settingsHasUnsavedChanges: boolean
  setSettingsUnsavedChanges: (value: boolean) => void
  /** Atomically replaces every editable Phase 1 settings slice after the
   * Settings Center has validated its draft. */
  applySettings: (settings: OwnerSettingsStateValue) => void
  /** Saves one validated Settings section without replacing unrelated slices. */
  applySettingsSection: <TSection extends SettingsSectionId>(
    section: TSection,
    value: SettingsSectionValueMap[TSection],
    actorRole: UserRole,
  ) => void
  /** Patches the store profile (name, contact info, branding). */
  updateStoreProfile: (patch: Partial<StoreProfileSettings>) => void
  /** Adds a new branch. */
  addBranch: (branch: BranchSettings) => void
  /** Patches an existing branch by id. Id itself can't be changed here. */
  updateBranch: (branchId: string, patch: Partial<BranchSettings>) => void
  /** Activates/deactivates a branch without touching its other fields. */
  setBranchActive: (branchId: string, isActive: boolean) => void
  /** Patches staff/role assignment rules (assignable roles, default role,
   * owner-role reassignment toggle). */
  updateStaffRoles: (patch: Partial<StaffRoleSettings>) => void
  /** Replaces the entire role → section access matrix. The 'settings'
   * section is force-pinned to 'edit' for 'owner' and 'none' for every
   * other role so Owner can never lock themselves out of Settings or grant
   * Settings access elsewhere. */
  setPermissions: (permissions: PermissionMatrix) => void
  setActionPermissions: (permissions: ActionPermissionMatrix, actorRole: UserRole) => void
  updateRoleActionPermission: (role: UserRole, capability: ActionCapability, enabled: boolean) => void
  /** Patches a single role's access level for a single section. Goes
   * through the same owner/settings guard as setPermissions. */
  updateRoleSectionAccess: (
    role: UserRole,
    section: AppSection,
    level: AccessLevel,
  ) => void
  /** Resets all settings back to defaults (demo/testing convenience). */
  savePayrollRevision: (params: { value: PayrollDefaultSettings; effectiveFrom: string; reason: string; actor: string; actorRole: UserRole }) => void
  saveSchedulingRevision: (params: { value: SchedulingSettings; effectiveFrom: string; reason: string; actor: string; actorRole: UserRole }) => void
  getPayrollSettingsForDate: (date: string) => PayrollDefaultSettings
  getSchedulingSettingsForDate: (date: string) => SchedulingSettings
  resetSettings: () => void
}

/**
 * @description Ensures the Settings Center itself can never be edited away
 * from Owner or granted to a non-owner role, regardless of what the Owner
 * enters in the Permission Matrix panel. Applied on every write.
 */
const withSettingsSectionGuard = (permissions: PermissionMatrix): PermissionMatrix => {
  const guarded = { ...permissions }
  for (const role of Object.keys(guarded) as Array<keyof PermissionMatrix>) {
    guarded[role] = {
      ...guarded[role],
      settings: role === 'owner' ? 'edit' : 'none',
      scheduling: role === 'owner' ? 'edit' : guarded[role].scheduling,
    }
  }
  return guarded
}

const SETTINGS_CAPABILITY_BY_SECTION: Record<SettingsSectionId, ActionCapability> = {
  'store-profile': 'settings.edit_store_profile',
  branches: 'settings.edit_branches',
  'staff-roles': 'settings.edit_roles',
  permissions: 'settings.edit_permissions',
  'payment-methods': 'settings.edit_payment_methods',
  attendance: 'settings.edit_attendance',
  scheduling: 'settings.edit_scheduling',
  payroll: 'settings.edit_payroll',
}

const canMutateSettings = (state: SettingsStoreState, role: UserRole, capability: ActionCapability): boolean =>
  hasActionPermission(role, capability, state.actionPermissions, state.permissions)

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  ...DEFAULT_OWNER_SETTINGS,
  actionPermissions: structuredClone(DEFAULT_ACTION_PERMISSIONS),
  payrollConfigRevisions: [{
    id: 'payroll-config-initial',
    effectiveFrom: '2026-01-01',
    value: structuredClone(DEFAULT_OWNER_SETTINGS.payroll),
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'Demo setup',
    changeReason: 'Initial payroll configuration',
  }],
  schedulingConfigRevisions: [{
    id: 'scheduling-config-initial',
    effectiveFrom: '2026-01-01',
    value: structuredClone(DEFAULT_OWNER_SETTINGS.scheduling),
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'Demo setup',
    changeReason: 'Initial scheduling configuration',
  }],
  settingsHasUnsavedChanges: false,
  setSettingsUnsavedChanges: (value) => set({ settingsHasUnsavedChanges: value }),

  applySettings: (settings) => {
    const permissions = withSettingsSectionGuard(settings.permissions)
    set({ ...settings, paymentMethods: normalizeBankAccounts(settings.paymentMethods), permissions, actionPermissions: guardActionPermissions(get().actionPermissions, permissions) })
  },

  applySettingsSection: (section, value, actorRole) =>
    set((state) => {
      if (!canMutateSettings(state, actorRole, SETTINGS_CAPABILITY_BY_SECTION[section])) return state
      switch (section) {
        case 'store-profile':
          return { storeProfile: value as SettingsSectionValueMap['store-profile'] }
        case 'branches':
          return { branches: value as SettingsSectionValueMap['branches'] }
        case 'staff-roles':
          return { staffRoles: value as SettingsSectionValueMap['staff-roles'] }
        case 'permissions':
          {
            const permissions = withSettingsSectionGuard(value as SettingsSectionValueMap['permissions'])
            return { permissions, actionPermissions: guardActionPermissions(state.actionPermissions, permissions) }
          }
        case 'payment-methods':
          return { paymentMethods: normalizeBankAccounts(value as SettingsSectionValueMap['payment-methods']) }
        case 'attendance':
          return { attendance: value as SettingsSectionValueMap['attendance'] }
        case 'scheduling':
          return { scheduling: value as SettingsSectionValueMap['scheduling'] }
        case 'payroll':
          return {
            payroll: value as SettingsSectionValueMap['payroll'],
          }
        default:
          return state
      }
    }),

  updateStoreProfile: (patch) =>
    set((state) => ({ storeProfile: { ...state.storeProfile, ...patch } })),

  addBranch: (branch) =>
    set((state) => ({ branches: [...state.branches, branch] })),

  updateBranch: (branchId, patch) =>
    set((state) => ({
      branches: state.branches.map((branch) =>
        branch.id === branchId ? { ...branch, ...patch, id: branch.id } : branch,
      ),
    })),

  setBranchActive: (branchId, isActive) =>
    set((state) => ({
      branches: state.branches.map((branch) =>
        branch.id === branchId ? { ...branch, isActive } : branch,
      ),
    })),

  updateStaffRoles: (patch) =>
    set((state) => ({ staffRoles: { ...state.staffRoles, ...patch } })),

  setPermissions: (permissions) =>
    set((state) => { const guarded = withSettingsSectionGuard(permissions); return { permissions: guarded, actionPermissions: guardActionPermissions(state.actionPermissions, guarded) } }),

  setActionPermissions: (permissions, actorRole) => set((state) => canMutateSettings(state, actorRole, 'settings.edit_permissions') ? ({ actionPermissions: guardActionPermissions(permissions, state.permissions) }) : state),

  updateRoleActionPermission: (role, capability, enabled) => set((state) => ({ actionPermissions: guardActionPermissions({ ...state.actionPermissions, [role]: { ...state.actionPermissions[role], [capability]: enabled } }, state.permissions) })),

  updateRoleSectionAccess: (role, section, level) =>
    set((state) => {
      const next = {
        ...state.permissions,
        [role]: { ...state.permissions[role], [section]: level },
      } as PermissionMatrix
      const guarded = withSettingsSectionGuard(next)
      return { permissions: guarded, actionPermissions: guardActionPermissions(state.actionPermissions, guarded) }
    }),


  savePayrollRevision: ({ value, effectiveFrom, reason, actor, actorRole }) =>
    set((state) => {
      if (!canMutateSettings(state, actorRole, 'settings.edit_payroll')) return state
      const revisions = closePreviousRevision(state.payrollConfigRevisions, effectiveFrom)
        .filter((revision) => revision.effectiveFrom !== effectiveFrom)
      const next: PayrollSettingsRevision = {
        id: `payroll-config-${effectiveFrom}-${Date.now()}`,
        effectiveFrom,
        value: { ...value },
        createdAt: new Date().toISOString(),
        createdBy: actor,
        changeReason: reason.trim(),
      }
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: value.timezone }).format(new Date())
      return {
        payrollConfigRevisions: [...revisions, next].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
        ...(effectiveFrom <= today ? { payroll: next.value } : {}),
      }
    }),

  saveSchedulingRevision: ({ value, effectiveFrom, reason, actor, actorRole }) =>
    set((state) => {
      if (!canMutateSettings(state, actorRole, 'settings.edit_scheduling')) return state
      const guardedValue = structuredClone(value)
      const revisions = closePreviousRevision(state.schedulingConfigRevisions, effectiveFrom)
        .filter((revision) => revision.effectiveFrom !== effectiveFrom)
      const next: SchedulingSettingsRevision = {
        id: `scheduling-config-${effectiveFrom}-${Date.now()}`,
        effectiveFrom,
        value: guardedValue,
        createdAt: new Date().toISOString(),
        createdBy: actor,
        changeReason: reason.trim(),
      }
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
      return {
        schedulingConfigRevisions: [...revisions, next].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
        ...(effectiveFrom <= today ? { scheduling: guardedValue } : {}),
      }
    }),

  getPayrollSettingsForDate: (date): PayrollDefaultSettings => {
    const state = get()
    return resolveEffectiveRevision(state.payrollConfigRevisions, date, state.payroll)
  },

  getSchedulingSettingsForDate: (date): SchedulingSettings => {
    const state = get()
    return resolveEffectiveRevision(state.schedulingConfigRevisions, date, state.scheduling)
  },

  resetSettings: () => set({ ...DEFAULT_OWNER_SETTINGS, actionPermissions: structuredClone(DEFAULT_ACTION_PERMISSIONS), payrollConfigRevisions: [{ id:'payroll-config-initial', effectiveFrom:'2026-01-01', value:structuredClone(DEFAULT_OWNER_SETTINGS.payroll), createdAt:'2026-01-01T00:00:00.000Z', createdBy:'Demo setup', changeReason:'Initial payroll configuration' }], schedulingConfigRevisions: [{ id:'scheduling-config-initial', effectiveFrom:'2026-01-01', value:structuredClone(DEFAULT_OWNER_SETTINGS.scheduling), createdAt:'2026-01-01T00:00:00.000Z', createdBy:'Demo setup', changeReason:'Initial scheduling configuration' }], settingsHasUnsavedChanges: false }),
}))
