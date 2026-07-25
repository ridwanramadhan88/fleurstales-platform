import type { Employee } from '../store/hrStoreTypes'
import type { UserRole } from '../store/userStore'
import { getSupabaseAuthClient } from '../api/supabaseAuth'
import { isSupabaseConfigured } from './shared/supabaseConfig'

export interface ProvisionStaffInput {
  employeeId: string
  username: string
  pin: string
  displayName: string
  role: Exclude<UserRole, 'owner'>
  branchId?: string
}

export const provisionStaffAccountSupabase = async (input: ProvisionStaffInput): Promise<void> => {
  if (!isSupabaseConfigured()) return
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase Auth is not configured.')
  const redirectTo = typeof window === 'undefined' ? undefined : window.location.origin
  const { data, error } = await client.functions.invoke('staff-admin', {
    body: { action: 'invite', ...input, redirectTo },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.message ?? data.error)
}

export const syncStaffAccessProfileSupabase = async (employee: Employee): Promise<void> => {
  if (!isSupabaseConfigured()) return
  const client = getSupabaseAuthClient()
  if (!client) return
  const { error } = await client.rpc('sync_staff_access_profile', {
    p_employee_id: employee.id,
    p_display_name: employee.name,
    p_role: employee.systemRole,
    p_username: employee.username ?? null,
    p_is_active: employee.status === 'active',
    p_branch_id: employee.branch || null,
  })
  if (error) throw error
}
