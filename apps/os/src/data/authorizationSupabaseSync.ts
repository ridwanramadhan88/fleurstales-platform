import { DEFAULT_ACTION_PERMISSIONS, guardActionPermissions, type ActionPermissionMatrix } from '../config/actionPermissions'
import { DEFAULT_ROLE_SECTION_ACCESS } from '../config/permissions'
import { useSettingsStore } from '../store/settingsStore'
import { useUserStore, type UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'
import { bootstrapSharedData } from './shared/bootstrap'
import type { Json } from './shared/databaseTypes'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession } from './shared/supabaseSession'
import { SupabaseHttpError } from './shared/supabaseHttpClient'
import { toast } from '../hooks/use-toast'

type AuthorizationResponse = {
  revision: number
  sections: Partial<PermissionMatrix>
  actions: Partial<ActionPermissionMatrix>
  features: { inventory?: boolean }
  updatedAt?: string | null
}

type AuthorizationPayload = {
  sections: PermissionMatrix
  actions: ActionPermissionMatrix
  features: { inventory: boolean }
}

let revision = 1
let syncing = false
let stopSubscription: (() => void) | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let lastSerialized = ''

const client = () => bootstrapSharedData(browserSupabaseTokenProvider)
const roles: UserRole[] = ['owner', 'admin', 'finance', 'hr', 'florist']

const mergeSections = (incoming: Partial<PermissionMatrix> | undefined): PermissionMatrix => {
  const next = structuredClone(DEFAULT_ROLE_SECTION_ACCESS) as PermissionMatrix
  for (const role of roles) {
    if (incoming?.[role]) next[role] = { ...next[role], ...incoming[role] }
  }
  // Governance invariants mirror the server and Settings UI. Owner is the
  // recovery authority and can never lose an entire workspace through a stale
  // or manually crafted authorization payload.
  for (const section of Object.keys(next.owner) as Array<keyof typeof next.owner>) {
    if (next.owner[section] === 'none') next.owner[section] = DEFAULT_ROLE_SECTION_ACCESS.owner[section]
  }
  next.owner.settings = 'edit'
  next.owner.scheduling = 'edit'
  for (const role of roles.filter((candidate) => candidate !== 'owner')) next[role].settings = 'none'
  return next
}

const mergeActions = (
  incoming: Partial<ActionPermissionMatrix> | undefined,
  sections: PermissionMatrix,
): ActionPermissionMatrix => {
  const next = structuredClone(DEFAULT_ACTION_PERMISSIONS)
  for (const role of roles) {
    if (incoming?.[role]) next[role] = { ...next[role], ...incoming[role] }
  }
  return guardActionPermissions(next, sections)
}

const localPayload = (): AuthorizationPayload => {
  const settings = useSettingsStore.getState()
  return {
    sections: settings.permissions,
    actions: settings.actionPermissions,
    features: { inventory: settings.storeProfile.inventoryEnabled },
  }
}

const serialize = (payload: AuthorizationPayload): string => JSON.stringify(payload)

const applyRemote = (remote: AuthorizationResponse): void => {
  const sections = mergeSections(remote.sections)
  const actions = mergeActions(remote.actions, sections)
  syncing = true
  try {
    useSettingsStore.setState((state) => ({
      permissions: sections,
      actionPermissions: actions,
      storeProfile: {
        ...state.storeProfile,
        inventoryEnabled: Boolean(remote.features?.inventory),
      },
    }))
    revision = Math.max(1, Number(remote.revision) || 1)
    lastSerialized = serialize(localPayload())
  } finally {
    syncing = false
  }
}

const isRevisionConflict = (error: unknown): boolean =>
  error instanceof SupabaseHttpError &&
  (error.message.includes('REVISION_CONFLICT:authorization') ||
    (typeof error.payload === 'object' && error.payload !== null && 'code' in error.payload && error.payload.code === '40001'))

export const hydrateAuthorizationFromSupabase = async (): Promise<boolean> => {
  if (!getSupabaseBrowserSession()) return false
  const boot = client()
  if (!boot.enabled) return false
  const remote = await boot.repositories.client.rpc<AuthorizationResponse>('get_authorization_config', {})
  applyRemote(remote)
  return true
}

const persistAuthorization = async (): Promise<void> => {
  if (syncing || useUserStore.getState().role !== 'owner' || !getSupabaseBrowserSession()) return
  const boot = client()
  if (!boot.enabled) return

  const payload = localPayload()
  const serialized = serialize(payload)
  if (serialized === lastSerialized) return

  try {
    const remote = await boot.repositories.client.rpc<AuthorizationResponse>('save_authorization_config', {
      p_expected_revision: revision,
      p_sections: payload.sections as unknown as Json,
      p_actions: payload.actions as unknown as Json,
      p_features: payload.features as unknown as Json,
    })
    applyRemote(remote)
  } catch (error) {
    if (isRevisionConflict(error)) {
      const expectedRevision = revision
      void boot.repositories.client.rpc('record_mutation_conflict', {
        p_action: 'authorization.save',
        p_entity_type: 'authorization',
        p_entity_id: 'primary',
        p_expected_revision: expectedRevision,
        p_observed_revision: undefined,
      }).catch(() => undefined)
      // Never last-write-wins Owner permissions. Pull the authoritative matrix;
      // the Owner can review/reapply their change after the Settings UI refreshes.
      await hydrateAuthorizationFromSupabase().catch(() => undefined)
      toast({
        title: 'Permissions not saved',
        description: 'Permissions changed in another session. The latest values were reloaded; reapply your change.',
      })
      return
    }
    // Keep the local UI usable if Supabase is temporarily unavailable. The next
    // saved Settings change will retry because lastSerialized was not advanced.
    console.error('Unable to save Fleurstales authorization configuration.', error)
    toast({
      title: 'Permissions not saved',
      description: error instanceof Error ? error.message : 'Unable to save permissions.',
    })
  }
}

const scheduleSave = (): void => {
  if (syncing || useUserStore.getState().role !== 'owner') return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    void persistAuthorization()
  }, 250)
}

export const startAuthorizationSupabaseSync = (): void => {
  if (stopSubscription || useUserStore.getState().role !== 'owner') return
  lastSerialized = serialize(localPayload())
  stopSubscription = useSettingsStore.subscribe(scheduleSave)
}

export const stopAuthorizationSupabaseSync = (): void => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  stopSubscription?.()
  stopSubscription = undefined
}

export const connectAuthorizationSupabase = async (): Promise<boolean> => {
  try {
    const hydrated = await hydrateAuthorizationFromSupabase()
    if (!hydrated) return false
    startAuthorizationSupabaseSync()
    return true
  } catch (error) {
    console.error('Unable to hydrate Fleurstales authorization configuration.', error)
    return false
  }
}
