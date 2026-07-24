import { bootstrapSharedData } from './bootstrap'
import { buildSupabaseStaffSession } from './staffSessionDomain'
import { clearSharedSession, setSharedStaffSession } from './sharedSessionStore'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession, setSupabaseBrowserSession } from './supabaseSession'

export type RefreshSupabaseStaffSessionResult =
  | { kind: 'unavailable'; reason: 'no_browser_session' | 'supabase_not_configured' }
  | { kind: 'unauthorized' }
  | { kind: 'ready'; session: ReturnType<typeof buildSupabaseStaffSession> }

/**
 * Resolves the authenticated Supabase user through the protected
 * `staff_access_profiles` mapping. It does not perform login or token refresh.
 */
export const refreshSupabaseStaffSession = async (): Promise<RefreshSupabaseStaffSessionResult> => {
  if (!getSupabaseBrowserSession()) return { kind: 'unavailable', reason: 'no_browser_session' }
  const boot = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!boot.enabled) return { kind: 'unavailable', reason: 'supabase_not_configured' }
  const profile = await boot.repositories.staffAccess.getCurrentProfile()
  if (!profile?.isActive) {
    setSupabaseBrowserSession(null)
    clearSharedSession()
    return { kind: 'unauthorized' }
  }
  const session = buildSupabaseStaffSession(profile)
  setSharedStaffSession(session)
  return { kind: 'ready', session }
}
