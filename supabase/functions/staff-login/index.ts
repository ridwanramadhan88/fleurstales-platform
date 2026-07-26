import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

const MAX_BODY_BYTES = 4096
const MIN_PRODUCTION_PASSWORD_LENGTH = 6
const REJECTION_DELAY_MS = 250

const configuredOrigins = (): string[] => (Deno.env.get('FLEURSTALES_ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const corsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get('origin')
  const allowed = configuredOrigins()
  const selectedOrigin = origin && allowed.length > 0
    ? (allowed.includes(origin) ? origin : 'null')
    : (origin ?? '*')
  return {
    'access-control-allow-origin': selectedOrigin,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
  }
}

const json = (request: Request, body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    ...corsHeaders(request),
    ...extraHeaders,
  },
})

const usernamePattern = /^[a-z][a-z0-9._-]*$/
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const invalidLogin = async (request: Request, stage: string, status = 401, retryAfterSeconds?: number): Promise<Response> => {
  console.warn('staff-login rejected', { stage })
  await sleep(REJECTION_DELAY_MS)
  return json(
    request,
    { error: 'INVALID_LOGIN' },
    status,
    retryAfterSeconds ? { 'retry-after': String(Math.max(1, Math.ceil(retryAfterSeconds))) } : {},
  )
}

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

const requestIp = (request: Request): string => {
  const cloudflare = request.headers.get('cf-connecting-ip')?.trim()
  if (cloudflare) return cloudflare
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const parseBody = async (request: Request): Promise<{ username?: string; credential?: string }> => {
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE')
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error('REQUEST_TOO_LARGE')
  return JSON.parse(raw) as { username?: string; credential?: string }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json(request, { ok: true })
  if (request.method !== 'POST') return json(request, { error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new Error('SUPABASE_URL is unavailable.')
    const body = await parseBody(request)
    const username = body.username?.trim().toLowerCase() ?? ''
    const credential = body.credential ?? ''
    if (!usernamePattern.test(username) || credential.length < MIN_PRODUCTION_PASSWORD_LENGTH) {
      return invalidLogin(request, 'invalid_input')
    }

    const admin = createClient(url, getSecretKey(), { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    const auth = createClient(url, getPublishableKey(), { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    const ipHash = await sha256(requestIp(request))
    const { data: throttle, error: throttleError } = await admin.rpc('service_consume_staff_login_attempt', {
      p_username: username,
      p_ip_hash: ipHash,
    })
    if (throttleError) throw throttleError
    const gate = (throttle ?? {}) as { allowed?: boolean; retryAfterSeconds?: number }
    if (gate.allowed !== true) return invalidLogin(request, 'rate_limited', 429, gate.retryAfterSeconds)

    const { data: profile, error: profileError } = await admin
      .from('staff_access_profiles')
      .select('user_id,is_active')
      .eq('username', username)
      .maybeSingle()
    if (profileError) return invalidLogin(request, 'profile_lookup_failed')
    if (!profile?.is_active) return invalidLogin(request, 'profile_missing_or_inactive')

    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(profile.user_id)
    const email = userResult.user?.email
    if (userError || !email) return invalidLogin(request, 'auth_user_lookup_failed')

    const { data: signedIn, error: signInError } = await auth.auth.signInWithPassword({ email, password: credential })
    if (signInError || !signedIn.session) return invalidLogin(request, 'credential_rejected')

    await admin.rpc('service_clear_staff_login_attempts', { p_username: username, p_ip_hash: ipHash })
      .then(({ error }) => { if (error) console.warn('staff-login throttle cleanup failed', { stage: 'cleanup' }) })
    return json(request, { session: signedIn.session })
  } catch (cause) {
    if (cause instanceof Error && (cause.message === 'REQUEST_TOO_LARGE' || cause instanceof SyntaxError)) {
      return invalidLogin(request, 'invalid_request')
    }
    console.error('staff-login failed', cause)
    return json(request, { error: 'STAFF_LOGIN_FAILED' }, 500)
  }
})
