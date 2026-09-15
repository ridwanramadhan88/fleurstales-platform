import type { Employee } from '../store/hrStoreTypes'
import type { UserRole } from '../store/userStore'
import { useUserStore } from '../store/userStore'
import { todayIsoDate, useHrStore } from '../store/hrStore'
import { getSupabaseAuthClient } from '../api/supabaseAuth'
import { isSupabaseConfigured } from './shared/supabaseConfig'

export interface ProvisionStaffInput {
  employeeId: string
  email: string
  username: string
  password: string
  displayName: string
  role: Exclude<UserRole, 'owner'>
  branchId?: string
}

const formatRemovalBlockers = (blockers:unknown):string => {
  if (!blockers || typeof blockers !== 'object') return 'This employee has operational history and cannot be permanently removed.'
  const labels=Object.entries(blockers as Record<string,unknown>).filter(([,value])=>Number(value)>0).map(([key,value])=>`${value} ${key}`)
  return labels.length ? `Permanent removal is blocked by ${labels.join(', ')}. Use Force resolve only when those linked records should be cleared.` : 'This employee has operational history and cannot be permanently removed.'
}

const staffFunctionError = async (error: unknown, fallback: string): Promise<Error> => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = error.context
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: string; message?: string; blockers?:unknown }
        if (body.message) return new Error(body.message)
        if (body.error === 'USERNAME_ALREADY_IN_USE') return new Error('Username is already in use.')
        if (body.error === 'EMAIL_ALREADY_IN_USE') return new Error('Email is already in use.')
        if (body.error === 'INVALID_STAFF_EMAIL') return new Error('Enter a valid staff email address.')
        if (body.error === 'EMPLOYEE_ALREADY_HAS_LOGIN') return new Error('This employee already has a login account.')
        if (body.error === 'STAFF_LOGIN_NOT_FOUND') return new Error('This employee has no Supabase login account yet.')
        if (body.error === 'STAFF_CREDENTIAL_UPDATE_FAILED') return new Error('The role was restored because the new password could not be saved.')
        if (body.error === 'EMPLOYEE_REMOVAL_BLOCKED') return new Error(formatRemovalBlockers(body.blockers))
        if (body.error === 'STAFF_AUTH_REMOVAL_FAILED') return new Error('The login account could not be removed. The employee remains disabled and the removal can be retried.')
        if (body.error === 'STAFF_REMOVAL_FINALIZE_FAILED') return new Error('The login was removed, but employee cleanup still needs to be retried.')
      } catch {
        // Use the clear workflow fallback below.
      }
    }
  }
  return new Error(fallback)
}

const applyLocalEmploymentStatusMetadata = (requested: Employee): void => {
  const current = useHrStore.getState().employees.find((item) => item.id === requested.id)
  if (!current || current.status === requested.status) return

  if (requested.status === 'inactive') {
    const separatedAt = new Date().toISOString()
    const separatedBy = useUserStore.getState().name.trim() || 'HR'
    useHrStore.setState((state) => ({
      employees: state.employees.map((item) => item.id === requested.id ? {
        ...item,
        employmentEndDate: item.employmentEndDate ?? todayIsoDate(),
        separationReason: item.separationReason ?? 'Employee deactivated',
        separatedAt: item.separatedAt ?? separatedAt,
        separatedBy: item.separatedBy ?? separatedBy,
      } : item),
    }))
    return
  }

  // Reactivation starts a new current-employment state. Historical payroll
  // rows keep their own snapshots; the employee record must not carry a stale
  // end date into future payroll eligibility checks.
  useHrStore.setState((state) => ({
    employees: state.employees.map((item) => {
      if (item.id !== requested.id) return item
      const { employmentEndDate: _employmentEndDate, separationReason: _separationReason, separatedAt: _separatedAt, separatedBy: _separatedBy, ...activeEmployee } = item
      return activeEmployee
    }),
  }))
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

export const syncStaffAccessProfileSupabase = async (employee: Employee, password?: string): Promise<void> => {
  if (!isSupabaseConfigured()) {
    applyLocalEmploymentStatusMetadata(employee)
    return
  }
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
      password: password || undefined,
    },
  })
  if (error) throw await staffFunctionError(error, 'Unable to synchronize the staff login account.')
  if (data?.error) throw new Error(data.message ?? data.error)
  applyLocalEmploymentStatusMetadata(employee)
}

export const removeStaffEmployeeSupabase = async (employeeId:string, reason:string, forceResolve=false):Promise<void> => {
  if (!isSupabaseConfigured()) return
  const client=getSupabaseAuthClient()
  if (!client) throw new Error('Supabase Auth is not configured.')
  const { data, error }=await client.functions.invoke('staff-admin',{
    body:{ action:'remove', employeeId, reason, forceResolve },
  })
  if (error) throw await staffFunctionError(error, 'Unable to permanently remove the employee.')
  if (data?.error) {
    if (data.error==='EMPLOYEE_REMOVAL_BLOCKED') throw new Error(formatRemovalBlockers(data.blockers))
    throw new Error(data.message ?? data.error)
  }
}