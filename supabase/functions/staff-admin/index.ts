import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

type StaffRole = 'admin' | 'finance' | 'hr' | 'florist'

type InviteRequest = {
  action?: 'invite'
  employeeId: string
  email?: string
  username: string
  pin: string
  displayName: string
  role: StaffRole
  branchId?: string | null
  redirectTo?: string
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
  },
})

const parsePublishableKey = (): string => {
  const modern = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Record<string, string>
      if (parsed.default) return parsed.default
      const first = Object.values(parsed).find(Boolean)
      if (first) return first
    } catch {
      // Fall through to the legacy anon key.
    }
  }
  const single = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
  if (single) return single
  const legacy = Deno.env.get('SUPABASE_ANON_KEY')
  if (!legacy) throw new Error('Supabase publishable key is unavailable to staff-admin.')
  return legacy
}

const parseSecretKey = (): string => {
  const modern = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (modern) {
    try {
      const parsed = JSON.parse(modern) as Record<string, string>
      if (parsed.default) return parsed.default
      const first = Object.values(parsed).find(Boolean)
      if (first) return first
    } catch {
      // Fall through to the legacy hosted secret.
    }
  }
  const single = Deno.env.get('SUPABASE_SECRET_KEY')
  if (single) return single
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!legacy) throw new Error('Supabase secret key is unavailable to staff-admin.')
  return legacy
}

const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
const validRoles = new Set<StaffRole>(['admin', 'finance', 'hr', 'florist'])
const usernamePattern = /^[a-z][a-z0-9._-]*$/

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return json({ ok: true })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!url) throw new Error('SUPABASE_URL is unavailable.')
    const authorization = request.headers.get('authorization') ?? ''
    const token = authorization.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'AUTH_REQUIRED' }, 401)

    const admin = createClient(url, parseSecretKey(), {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const userClient = createClient(url, parsePublishableKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const { data: userResult, error: userError } = await admin.auth.getUser(token)
    if (userError || !userResult.user) return json({ error: 'INVALID_SESSION' }, 401)

    const { data: actorProfile, error: profileError } = await userClient.rpc('get_current_staff_access_profile')
    if (profileError) throw profileError
    if (!actorProfile?.isActive) return json({ error: 'ACTIVE_STAFF_REQUIRED' }, 403)

    const body = await request.json() as InviteRequest
    if ((body.action ?? 'invite') !== 'invite') return json({ error: 'UNSUPPORTED_ACTION' }, 400)
    const employeeId = body.employeeId?.trim()
    const email = body.email?.trim().toLowerCase()
    const username = body.username?.trim().toLowerCase()
    const pin = body.pin?.trim()
    const displayName = body.displayName?.trim()
    const role = body.role
    if (!employeeId || !displayName || !username || !usernamePattern.test(username) || !pin || !/^\d{6}$/.test(pin) || !validRoles.has(role)) {
      return json({ error: 'INVALID_STAFF_INVITE' }, 400)
    }

    const { data: mayInvite, error: invitePermissionError } = await userClient.rpc('can_invite_staff_role', { p_role: role })
    if (invitePermissionError) throw invitePermissionError
    if (!mayInvite) return json({ error: 'STAFF_INVITE_FORBIDDEN' }, 403)

    const { data: existingProfile, error: existingProfileError } = await admin
      .from('staff_access_profiles')
      .select('user_id,username')
      .eq('employee_id', employeeId)
      .maybeSingle()
    if (existingProfileError) throw existingProfileError
    if (existingProfile) return json({ error: 'EMPLOYEE_ALREADY_HAS_LOGIN' }, 409)
    const { data: existingUsername, error: existingUsernameError } = await admin
      .from('staff_access_profiles')
      .select('user_id')
      .eq('username', username)
      .maybeSingle()
    if (existingUsernameError) throw existingUsernameError
    if (existingUsername) return json({ error: 'USERNAME_ALREADY_IN_USE' }, 409)

    const authEmail = email && isEmail(email) ? email : `${username}@staff.fleurstales.local`
    const { data: invite, error: inviteError } = await admin.auth.admin.createUser({
      email: authEmail,
      password: pin,
      email_confirm: true,
      user_metadata: { fleurstales_employee_id: employeeId, fleurstales_display_name: displayName },
    })
    if (inviteError || !invite.user) return json({ error: 'INVITE_FAILED', message: inviteError?.message ?? 'Supabase did not return the staff user.' }, 400)

    const userId = invite.user.id
    try {
      const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
        app_metadata: { fleurstales_employee_id: employeeId },
      })
      if (metadataError) throw metadataError

      const { error: accessError } = await admin.from('staff_access_profiles').upsert({
        user_id: userId,
        employee_id: employeeId,
        username,
        display_name: displayName,
        role,
        branch_id: body.branchId ?? null,
        is_active: true,
      }, { onConflict: 'user_id' })
      if (accessError) throw accessError
    } catch (cause) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined)
      throw cause
    }

    return json({ ok: true, userId, employeeId, username, role })
  } catch (cause) {
    console.error('staff-admin failed', cause)
    return json({ error: 'STAFF_ADMIN_FAILED', message: cause instanceof Error ? cause.message : 'Unknown error.' }, 500)
  }
})
