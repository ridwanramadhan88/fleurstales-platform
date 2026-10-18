import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

// "Forgot password" by staff username. The response is always the same
// generic success so the endpoint cannot be used to discover usernames or
// recovery emails. Throttling is per username and per IP.
const MAX_BODY_BYTES = 1024
const RESPONSE_DELAY_MS = 400

const allowedOrigins = (): string[] => (Deno.env.get('FLEURSTALES_ALLOWED_ORIGINS') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean)

const corsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get('origin')
  const allowed = allowedOrigins()
  const selected = origin && allowed.length > 0 ? (allowed.includes(origin) ? origin : 'null') : (origin ?? '*')
  return {
    'access-control-allow-origin': selected,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    'vary': 'Origin',
  }
}

const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(request) },
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const usernamePattern = /^[a-z][a-z0-9._-]*$/

const getKey = (pluralName: string, singleName: string, legacyName: string): string => {
  const modern = Deno.env.get(pluralName)
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Record<string, string>
      const value = parsed.default ?? Object.values(parsed).find(Boolean)
      if (value) return value
    } catch { /* fall through */ }
  }
  const single = Deno.env.get(singleName) ?? Deno.env.get(legacyName)
  if (!single) throw new Error(`${singleName} is unavailable.`)
  return single
}

const requestIp = (request: Request): string =>
  request.headers.get('cf-connecting-ip')?.trim()
  || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || request.headers.get('x-real-ip')?.trim()
  || 'unknown'

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json(request, { ok: true })
  if (request.method !== 'POST') return json(request, { error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new Error('SUPABASE_URL is unavailable.')
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      await sleep(RESPONSE_DELAY_MS)
      return json(request, { ok: true })
    }
    const username = String((JSON.parse(raw) as { username?: unknown }).username ?? '').trim().toLowerCase()
    if (!usernamePattern.test(username)) {
      await sleep(RESPONSE_DELAY_MS)
      return json(request, { ok: true })
    }

    const admin = createClient(url, getKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })
    const publicClient = createClient(url, getKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY'), { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } })

    const ipHash = await sha256(requestIp(request))
    const { data: gate, error: gateError } = await admin.rpc('service_consume_staff_reset_attempt', { p_username: username, p_ip_hash: ipHash })
    if (gateError) throw gateError
    if ((gate as { allowed?: boolean } | null)?.allowed !== true) {
      await sleep(RESPONSE_DELAY_MS)
      return json(request, { error: 'RATE_LIMITED', retryAfterSeconds: Number((gate as { retryAfterSeconds?: number } | null)?.retryAfterSeconds ?? 900) }, 429)
    }

    const { data: profile } = await admin.from('staff_access_profiles').select('user_id,is_active').eq('username', username).maybeSingle()
    if (profile?.is_active) {
      const { data: userResult } = await admin.auth.admin.getUserById(profile.user_id)
      const email = userResult.user?.email
      if (email) {
        const origin = request.headers.get('origin')
        const allowed = allowedOrigins()
        const redirectTo = origin && (allowed.length === 0 || allowed.includes(origin)) ? origin : allowed[0]
        const { error } = await publicClient.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
        if (error) console.warn('staff-password-reset send failed', { stage: 'send' })
      }
    }
    await sleep(RESPONSE_DELAY_MS)
    return json(request, { ok: true })
  } catch (cause) {
    console.error('staff-password-reset failed', cause)
    return json(request, { ok: true })
  }
})
