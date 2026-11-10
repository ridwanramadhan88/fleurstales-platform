import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

// Staff account lifecycle (Owner / HR). Every action changes the Supabase Auth
// user, the login profile and the HR employee record together:
//   invite  - create Auth user, then provision_staff_employee (profile + HR row)
//   update  - update_staff_employee patch (profile + HR row), then Auth email /
//             password; the patch is reverted if the Auth change fails
//   remove  - prepare_staff_removal, delete Auth user, finalize_unused_staff_removal
//   send_reset - authorize_staff_password_reset (scope + throttle + audit), then
//             Supabase Auth emails a reset link to the staff recovery email
// Responses carry the new HR revision so the OS adopts the server copy instead
// of saving its own (which is how logins and HR records used to drift apart).

type StaffRole = 'admin' | 'finance' | 'hr' | 'florist' | 'courier' | 'manager'
type EmployeePatchKey = 'name' | 'phone' | 'hireDate' | 'systemRole' | 'username' | 'email' | 'status'
type EmployeePatch = Partial<Record<EmployeePatchKey, string>>

type InviteRequest = {
  action?: 'invite'
  employee?: Record<string, unknown>
  password: string
  branchId?: string | null
  redirectTo?: string
  // Legacy (OS <= 2.8.17) flat shape.
  employeeId?: string
  email?: string
  username?: string
  displayName?: string
  role?: StaffRole
}

type UpdateRequest = {
  action: 'update'
  employeeId: string
  patch?: EmployeePatch
  password?: string
  // Legacy (OS <= 2.8.17) full-profile shape.
  email?: string
  username?: string
  displayName?: string
  role?: StaffRole
  isActive?: boolean
}

type RemoveRequest = {
  action: 'remove'
  employeeId: string
  reason: string
  forceResolve?: boolean
}

type SendResetRequest = {
  action: 'send_reset'
  employeeId: string
}

type StaffRequest = InviteRequest | UpdateRequest | RemoveRequest | SendResetRequest

type RpcError = { message?: string; code?: string } | null

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
const validRoles = new Set<StaffRole>(['admin', 'finance', 'hr', 'florist', 'courier', 'manager'])
const usernamePattern = /^[a-z][a-z0-9._-]*$/
const MIN_STAFF_PASSWORD_LENGTH = 6
const isStrongPassword = (value: string): boolean => value.length >= MIN_STAFF_PASSWORD_LENGTH
const PATCH_KEYS: readonly EmployeePatchKey[] = ['name', 'phone', 'hireDate', 'systemRole', 'username', 'email', 'status']

// Database errors are raised as `CODE` or `CODE:detail`; pass the code through.
const rpcErrorCode = (error: RpcError, fallback: string): string => {
  const head = (error?.message ?? '').split(':')[0]?.trim() ?? ''
  return /^[A-Z][A-Z0-9_]+$/.test(head) ? head : fallback
}
const rpcFailure = (error: RpcError, fallback: string, status = 400) =>
  json({ error: rpcErrorCode(error, fallback), message: error?.message ?? fallback }, status)

const allowedOrigins = (): string[] => (Deno.env.get('FLEURSTALES_ALLOWED_ORIGINS') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean)

// Shows "ri***@gmail.com" so Owner/HR can confirm where the link went.
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`
}

const jakartaToday = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())

const toPatch = (body: UpdateRequest): EmployeePatch => {
  if (body.patch && typeof body.patch === 'object') {
    const patch: EmployeePatch = {}
    for (const key of PATCH_KEYS) {
      const value = body.patch[key]
      if (typeof value === 'string') patch[key] = value
    }
    return patch
  }
  // Legacy clients always sent the whole profile.
  const patch: EmployeePatch = {}
  if (typeof body.displayName === 'string') patch.name = body.displayName
  if (typeof body.role === 'string') patch.systemRole = body.role
  if (typeof body.username === 'string' && body.username.trim()) patch.username = body.username
  if (typeof body.email === 'string' && body.email.trim()) patch.email = body.email
  if (typeof body.isActive === 'boolean') patch.status = body.isActive ? 'active' : 'inactive'
  return patch
}

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

    const body = await request.json() as StaffRequest
    const action = body.action ?? 'invite'
    if (action !== 'invite' && action !== 'update' && action !== 'remove' && action !== 'send_reset') return json({ error: 'UNSUPPORTED_ACTION' }, 400)

    // ------------------------------------------------------------ send_reset
    if (action === 'send_reset') {
      const employeeId = (body as SendResetRequest).employeeId?.trim()
      if (!employeeId) return json({ error: 'INVALID_STAFF_RESET' }, 400)
      const { data: gate, error: gateError } = await userClient.rpc('authorize_staff_password_reset', { p_employee_id: employeeId })
      if (gateError) {
        const code = rpcErrorCode(gateError, 'STAFF_RESET_REJECTED')
        return json({ error: code, message: gateError.message }, code === 'RATE_LIMITED' ? 429 : 400)
      }
      const email = String((gate as { email?: string } | null)?.email ?? '')
      const origin = request.headers.get('origin')
      const allowed = allowedOrigins()
      const redirectTo = origin && (allowed.length === 0 || allowed.includes(origin)) ? origin : allowed[0]
      const publicClient = createClient(url, parsePublishableKey(), {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      })
      const { error: sendError } = await publicClient.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
      if (sendError) return json({ error: 'STAFF_RESET_SEND_FAILED', message: sendError.message }, 502)
      return json({ ok: true, employeeId, sentTo: maskEmail(email) })
    }

    // ---------------------------------------------------------------- remove
    if (action === 'remove') {
      const removal = body as RemoveRequest
      const employeeId = removal.employeeId?.trim()
      if (!employeeId || (removal.reason?.trim().length ?? 0) < 3) return json({ error: 'INVALID_STAFF_REMOVAL' }, 400)
      if (!['owner','hr'].includes(actorProfile.role)) return json({ error: 'HR_OR_OWNER_REQUIRED' }, 403)
      const { data: prepared, error: prepareError } = await userClient.rpc('prepare_staff_removal', {
        p_employee_id: employeeId,
        p_reason: removal.reason.trim(),
        p_force: Boolean(removal.forceResolve),
      })
      if (prepareError) return json({ error: 'STAFF_REMOVAL_PREPARE_FAILED', code: rpcErrorCode(prepareError, 'STAFF_REMOVAL_PREPARE_FAILED'), message: prepareError.message }, 400)
      if (!prepared?.allowed) return json({ error: 'EMPLOYEE_REMOVAL_BLOCKED', blockers: prepared?.blockers ?? {} }, 409)
      const targetUserId = prepared.targetUserId as string | undefined
      if (targetUserId) {
        const { data: targetAuth } = await admin.auth.admin.getUserById(targetUserId)
        if (targetAuth?.user) {
          const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId)
          if (deleteError) return json({ error: 'STAFF_AUTH_REMOVAL_FAILED', message: deleteError.message }, 400)
        }
      }
      const { data: finalized, error: finalizeError } = await userClient.rpc('finalize_unused_staff_removal', {
        p_request_id: prepared.requestId,
      })
      if (finalizeError || !finalized?.removed) return json({ error: 'STAFF_REMOVAL_FINALIZE_FAILED', message: finalizeError?.message ?? 'Removal was not finalized.' }, 400)
      return json({ ok: true, employeeId, removed: true, forceResolved: Boolean(prepared.forceResolved) })
    }

    // ---------------------------------------------------------------- update
    if (action === 'update') {
      const update = body as UpdateRequest
      const employeeId = update.employeeId?.trim()
      if (!employeeId) return json({ error: 'INVALID_STAFF_UPDATE' }, 400)
      const patch = toPatch(update)
      const password = update.password || undefined
      if (patch.email !== undefined) {
        patch.email = patch.email.trim().toLowerCase()
        if (!isEmail(patch.email)) return json({ error: 'INVALID_STAFF_EMAIL' }, 400)
      }
      if (patch.username !== undefined) {
        patch.username = patch.username.trim().toLowerCase()
        if (!usernamePattern.test(patch.username)) return json({ error: 'INVALID_STAFF_USERNAME' }, 400)
      }
      if (patch.systemRole !== undefined && !validRoles.has(patch.systemRole as StaffRole)) return json({ error: 'INVALID_STAFF_ROLE' }, 400)
      if (password && !isStrongPassword(password)) return json({ error: 'WEAK_STAFF_PASSWORD' }, 400)

      // The RPC is also the authority check: it runs before any Auth change.
      const { data: result, error: updateError } = await userClient.rpc('update_staff_employee', {
        p_employee_id: employeeId,
        p_patch: patch,
        p_require_login: Boolean(password),
      })
      if (updateError) return rpcFailure(updateError, 'STAFF_ACCESS_UPDATE_REJECTED')

      const changed = new Set<string>(Array.isArray(result?.changed) ? result.changed : [])
      const login = result?.login as { userId: string; email: string } | null
      const emailChanged = Boolean(login && changed.has('email'))
      if (login && (password || emailChanged)) {
        const credentials = {
          ...(password ? { password } : {}),
          ...(emailChanged ? { email: login.email, email_confirm: true } : {}),
        }
        const { error: credentialError } = await admin.auth.admin.updateUserById(login.userId, credentials)
        if (credentialError) {
          // Put the employee + profile back exactly as they were.
          const previous = (result?.previous ?? {}) as Record<string, unknown>
          const revert: EmployeePatch = {}
          for (const key of PATCH_KEYS) {
            if (key in patch && changed.has(key) && typeof previous[key] === 'string') revert[key] = previous[key] as string
          }
          if (Object.keys(revert).length) {
            await userClient.rpc('update_staff_employee', { p_employee_id: employeeId, p_patch: revert, p_require_login: false })
          }
          const duplicateEmail = /already|registered|exists/i.test(credentialError.message)
          return json({ error: duplicateEmail ? 'EMAIL_ALREADY_IN_USE' : 'STAFF_CREDENTIAL_UPDATE_FAILED', message: credentialError.message }, 400)
        }
      }

      return json({
        ok: true,
        employeeId,
        revision: result?.revision,
        employee: result?.employee,
        login,
        changed: [...changed],
      })
    }

    // ---------------------------------------------------------------- invite
    const invite = body as InviteRequest
    const source = invite.employee && typeof invite.employee === 'object' ? invite.employee : {
      id: invite.employeeId,
      name: invite.displayName,
      systemRole: invite.role,
      email: invite.email,
      username: invite.username,
      phone: '',
      hireDate: jakartaToday(),
    }
    const employeeId = String(source.id ?? '').trim()
    const email = String(source.email ?? '').trim().toLowerCase()
    const username = String(source.username ?? '').trim().toLowerCase()
    const displayName = String(source.name ?? '').trim()
    const role = String(source.systemRole ?? '') as StaffRole
    const password = invite.password
    if (!employeeId || !displayName || !username || !usernamePattern.test(username) || !validRoles.has(role)) {
      return json({ error: 'INVALID_STAFF_INVITE' }, 400)
    }
    if (!email || !isEmail(email)) return json({ error: 'INVALID_STAFF_EMAIL' }, 400)
    if (!password || !isStrongPassword(password)) return json({ error: 'WEAK_STAFF_PASSWORD' }, 400)
    const { data: mayInvite, error: invitePermissionError } = await userClient.rpc('can_invite_staff_role', { p_role: role })
    if (invitePermissionError) throw invitePermissionError
    if (!mayInvite) return json({ error: 'STAFF_INVITE_FORBIDDEN' }, 403)

    const { data: existingProfile, error: existingProfileError } = await admin
      .from('staff_access_profiles')
      .select('user_id,employee_id,email,username,role,is_active')
      .eq('employee_id', employeeId)
      .maybeSingle()
    if (existingProfileError) throw existingProfileError
    if (existingProfile) {
      if (existingProfile.email === email && existingProfile.username === username && existingProfile.role === role && existingProfile.is_active) {
        return json({
          ok: true,
          existing: true,
          userId: existingProfile.user_id,
          employeeId: existingProfile.employee_id,
          username: existingProfile.username,
          role: existingProfile.role,
        })
      }
      return json({ error: 'EMPLOYEE_ALREADY_HAS_LOGIN' }, 409)
    }
    const { data: existingUsername, error: existingUsernameError } = await admin
      .from('staff_access_profiles')
      .select('user_id')
      .eq('username', username)
      .maybeSingle()
    if (existingUsernameError) throw existingUsernameError
    if (existingUsername) return json({ error: 'USERNAME_ALREADY_IN_USE' }, 409)
    const { data: existingEmail, error: existingEmailError } = await admin
      .from('staff_access_profiles')
      .select('user_id')
      .ilike('email', email)
      .maybeSingle()
    if (existingEmailError) throw existingEmailError
    if (existingEmail) return json({ error: 'EMAIL_ALREADY_IN_USE' }, 409)

    const { data: invitedUser, error: inviteError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { fleurstales_employee_id: employeeId },
      user_metadata: { fleurstales_employee_id: employeeId, fleurstales_display_name: displayName },
    })
    if (inviteError || !invitedUser.user) {
      const duplicateEmail = /already|registered|exists/i.test(inviteError?.message ?? '')
      return json({ error: duplicateEmail ? 'EMAIL_ALREADY_IN_USE' : 'INVITE_FAILED', message: inviteError?.message ?? 'Supabase did not return the staff user.' }, 400)
    }

    const userId = invitedUser.user.id
    const { data: provisioned, error: provisionError } = await userClient.rpc('provision_staff_employee', {
      p_user_id: userId,
      p_employee: { ...source, id: employeeId, name: displayName, systemRole: role, email, username },
      p_branch_id: invite.branchId ?? null,
    })
    if (provisionError) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined)
      return rpcFailure(provisionError, 'STAFF_PROVISION_FAILED')
    }

    return json({
      ok: true,
      userId,
      employeeId,
      email,
      username,
      role,
      revision: provisioned?.revision,
      employee: provisioned?.employee,
    })
  } catch (cause) {
    console.error('staff-admin failed', cause)
    return json({ error: 'STAFF_ADMIN_FAILED', message: cause instanceof Error ? cause.message : 'Unknown error.' }, 500)
  }
})
