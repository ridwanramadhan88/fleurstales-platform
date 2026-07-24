import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { resolveSupabaseConfig } from '../data/shared/supabaseConfig'
import { setSupabaseBrowserSession } from '../data/shared/supabaseSession'

let client: SupabaseClient | null | undefined

const syncBrowserSession = (session: Session | null): void => {
  setSupabaseBrowserSession(session ? {
    accessToken: session.access_token,
    userId: session.user.id,
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
  } : null)
}

export const getSupabaseAuthClient = (): SupabaseClient | null => {
  if (client !== undefined) return client
  const resolved = resolveSupabaseConfig()
  if (!resolved.enabled) {
    client = null
    return client
  }
  client = createClient(resolved.config.url, resolved.config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  })
  return client
}

export const initializeSupabaseAuth = async (): Promise<Session | null> => {
  const authClient = getSupabaseAuthClient()
  if (!authClient) return null
  const { data, error } = await authClient.auth.getSession()
  if (error) throw error
  syncBrowserSession(data.session)
  return data.session
}

export const subscribeSupabaseAuth = (
  listener: (event: AuthChangeEvent, session: Session | null) => void,
): (() => void) => {
  const authClient = getSupabaseAuthClient()
  if (!authClient) return () => undefined
  const { data } = authClient.auth.onAuthStateChange((event, session) => {
    syncBrowserSession(session)
    listener(event, session)
  })
  return () => data.subscription.unsubscribe()
}

export const signInSupabaseWithPassword = async (email: string, password: string): Promise<Session> => {
  const authClient = getSupabaseAuthClient()
  if (!authClient) throw new Error('Supabase Auth is not configured.')
  const { data, error } = await authClient.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
  if (!data.session) throw new Error('Sign-in did not return a session.')
  syncBrowserSession(data.session)
  return data.session
}

export const sendSupabasePasswordReset = async (email: string): Promise<void> => {
  const authClient = getSupabaseAuthClient()
  if (!authClient) throw new Error('Supabase Auth is not configured.')
  const redirectTo = typeof window === 'undefined' ? undefined : window.location.origin
  const { error } = await authClient.auth.resetPasswordForEmail(email.trim(), { redirectTo })
  if (error) throw error
}

export const updateSupabasePassword = async (password: string): Promise<void> => {
  const authClient = getSupabaseAuthClient()
  if (!authClient) throw new Error('Supabase Auth is not configured.')
  const { error } = await authClient.auth.updateUser({ password })
  if (error) throw error
}

export const signOutSupabase = async (): Promise<void> => {
  const authClient = getSupabaseAuthClient()
  if (!authClient) {
    syncBrowserSession(null)
    return
  }
  const { error } = await authClient.auth.signOut()
  syncBrowserSession(null)
  if (error) throw error
}
