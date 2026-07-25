import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
  },
})

const usernamePattern = /^[a-z][a-z0-9._-]*$/

const getSecretKey = (): string => {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Record<string, string>
      if (parsed.default) return parsed.default
      const first = Object.values(parsed).find(Boolean)
      if (first) return first
    } catch { /* fall through */ }
  }
  const single = Deno.env.get('SUPABASE_SECRET_KEY')
  if (single) return single
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!legacy) throw new Error('Supabase secret key is unavailable to staff-login.')
  return legacy
}

const getPublishableKey = (): string => {
  const modern = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Record<string, string>
      if (parsed.default) return parsed.default
      const first = Object.values(parsed).find(Boolean)
      if (first) return first
    } catch { /* fall through */ }
  }
  const single = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  if (single) return single
  const legacy = Deno.env.get('SUPABASE_ANON_KEY')
  if (!legacy) throw new Error('Supabase publishable key is unavailable to staff-login.')
  return legacy
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json({ ok: true })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new Error('SUPABASE_URL is unavailable.')
    const body = await request.json() as { username?: string; credential?: string }
    const username = body.username?.trim().toLowerCase() ?? ''
    const credential = body.credential ?? ''
    if (!usernamePattern.test(username) || credential.length < 6) return json({ error: 'INVALID_LOGIN' }, 401)

    const admin = createClient(url, getSecretKey(), { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    const auth = createClient(url, getPublishableKey(), { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    const { data: profile, error: profileError } = await admin
      .from('staff_access_profiles')
      .select('user_id,is_active')
      .eq('username', username)
      .maybeSingle()
    if (profileError || !profile?.is_active) return json({ error: 'INVALID_LOGIN' }, 401)

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(profile.user_id)
    const email = userResult.user?.email
    if (userError || !email) return json({ error: 'INVALID_LOGIN' }, 401)

    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password: credential })
    if (signInError || !signedIn.session) return json({ error: 'INVALID_LOGIN' }, 401)
    return json({ session: signedIn.session })
  } catch (cause) {
    console.error('staff-login failed', cause)
    return json({ error: 'STAFF_LOGIN_FAILED' }, 500)
  }
})
