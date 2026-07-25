import type { Employee } from '../store/hrStoreTypes'
import type { UserRole } from '../store/userStore'
import { getSupabaseAuthClient } from '../api/supabaseAuth'
import { isSupabaseConfigured } from './shared/supabaseConfig'

export interface ProvisionStaffInput {
  employeeId: string
  email: string
  username: string
  pin: string
  displayName: string
  role: Exclude<UserRole, 'owner'>
  branchId?: string
}

const staffFunctionError = async (error: unknown, fallback: string): Promise<Error> => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = error.context
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: string; message?: string }
        if (body.message) return new Error(body.message)
        if (body.error === 'USERNAME_ALREADY_IN_USE') return new Error('Username is already in use.')
        if (body.error === 'EMAIL_ALREADY_IN_USE') return new Error('Email is already in use.')
        if (body.error === 'INVALID_STAFF_EMAIL') return new Error('Enter a valid staff email address.')
        if (body.error === 'EMPLOYEE_ALREADY_HAS_LOGIN') return new Error('This employee already has a login account.')
        if (body.error === 'STAFF_LOGIN_NOT_FOUND') return new Error('This employee has no Supabase login account yet.')
        if (body.error === 'STAFF_CREDENTIAL_UPDATE_FAILED') return new Error('The role was restored because the new PIN could not be saved.')
      } catch {
        // Use the clear workflow fallback below.
      }
    }
  }
  return new Error(fallback)
}

export const provisionStaffAccountSupabase = async (input: ProvisionStaffInput): Promise<void> => {
  if (!isSupabaseConfigured()) return
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase Auth is not configured.')
  const redirectTo = typeof window === 'undefined' ? undefined : window.location.origin
  const { data, error } = await client.functions.invoke('staff-admin', {
    body: { action: 'invite', ...input, redirectTo },
  })
  if (error) throw await staffFunctionError(error, 'Unable to create the staff login account.')
  if (data?.error) throw new Error(data.message ?? data.error)
}

export const syncStaffAccessProfileSupabase = async (employee: Employee, pin?: string): Promise<void> => {
  if (!isSupabaseConfigured()) return
  const client = getSupabaseAuthClient()
  if (!client) return
  const { data, error } = await client.functions.invoke('staff-admin', {
    body: {
      action: 'update',
      employeeId: employee.id,
      email: employee.email?.trim().toLowerCase() || undefined,
      displayName: employee.name,
      role: employee.systemRole,
      username: employee.username ?? '',
      isActive: employee.status === 'active',
      branchId: employee.branch || null,
      pin: pin || undefined,
    },
  })
  if (error) throw await staffFunctionError(error, 'Unable to synchronize the staff login account.')
  if (data?.error) throw new Error(data.message ?? data.error)
}
