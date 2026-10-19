import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const order: string[] = []
  let releaseSignOut: () => void = () => undefined
  const signOut = vi.fn(() => new Promise<{ error: null }>((resolve) => {
    order.push('signOut:start')
    releaseSignOut = () => { order.push('signOut:end'); resolve({ error: null }) }
  }))
  const getSession = vi.fn(async () => {
    order.push('getSession')
    return { data: { session: null }, error: null }
  })
  return { order, signOut, getSession, release: () => releaseSignOut() }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signOut: mocks.signOut,
      getSession: mocks.getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}))
vi.mock('../data/shared/supabaseConfig', () => ({
  resolveSupabaseConfig: () => ({ enabled: true, config: { url: 'https://example.supabase.co', publishableKey: 'k' } }),
}))
vi.mock('../data/shared/supabaseSession', () => ({ setSupabaseBrowserSession: () => undefined }))

import { initializeSupabaseAuth, signOutSupabase } from './supabaseAuth'

describe('session restore vs. sign-out', () => {
  beforeEach(() => { mocks.order.length = 0 })

  it('does not read the session until an in-flight sign-out has finished', async () => {
    const signingOut = signOutSupabase()
    const restoring = initializeSupabaseAuth()
    await Promise.resolve()
    expect(mocks.order).toEqual(['signOut:start'])
    mocks.release()
    await Promise.all([signingOut, restoring])
    expect(mocks.order).toEqual(['signOut:start', 'signOut:end', 'getSession'])
  })
})
