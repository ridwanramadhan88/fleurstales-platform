import type { Employee } from '../store/hrStoreTypes'
import { useUserStore } from '../store/userStore'
import { todayIsoDate, useHrStore } from '../store/hrStore'
import { getSupabaseAuthClient } from '../api/supabaseAuth'
import { isSupabaseConfigured } from './shared/supabaseConfig'
import { reloadOperationalDomain, runHrServerMutation } from './operationalSupabaseSync'

/**
 * Staff account lifecycle against the trusted `staff-admin` Edge Function.
 *
 * Every call changes the Supabase login and the HR employee record in one
 * server transaction, then adopts the server's HR revision. The browser no
 * longer writes its own copy of the employee afterwards - that second write is
 * what used to leave logins and HR records out of sync.
 */

export type StaffEmployeePatch = Partial<Pick<Employee, 'name' | 'phone' | 'hireDate' | 'systemRole' | 'username' | 'email' | 'status'>>

export interface ProvisionStaffInput {
  /** Complete new employee record (without pin); identity fields are re-validated by the server. */
  employee: Employee
  password: string
  branchId?: string
}

const formatRemovalBlockers = (blockers:unknown):string => {
  if (!blockers || typeof blockers !== 'object') return 'This employee has operational history and cannot be permanently removed.'
  const labels=Object.entries(blockers as Record<string,unknown>).filter(([,value])=>Number(value)>0).map(([key,value])=>`${value} ${key}`)
  return labels.length ? `Permanent removal is blocked by ${labels.join(', ')}. Use Force resolve only when those linked records should be cleared.` : 'This employee has operational history and cannot be permanently removed.'
}

const STAFF_ERROR_MESSAGES: Record<string, string> = {
  USERNAME_ALREADY_IN_USE: 'Username is already in use.',
  STAFF_USERNAME_IN_USE: 'Username is already in use.',
  EMAIL_ALREADY_IN_USE: 'Email is already in use.',
  USERNAME_OR_EMAIL_ALREADY_IN_HR: 'This username or email already belongs to another employee.',
  INVALID_STAFF_EMAIL: 'Enter a valid staff email address.',
  INVALID_STAFF_USERNAME: 'Use lowercase letters, numbers, dots, underscores, or hyphens.',
  INVALID_STAFF_PHONE: 'Enter a valid WhatsApp number.',
  INVALID_STAFF_HIRE_DATE: 'Hire date is required and cannot be in the future.',
  INVALID_STAFF_DISPLAY_NAME: 'Employee name is required.',
  WEAK_STAFF_PASSWORD: 'Password must be at least 6 characters.',
  EMPLOYEE_ALREADY_HAS_LOGIN: 'This employee already has a login account.',
  STAFF_LOGIN_NOT_FOUND: 'This employee has no login account yet.',
  EMPLOYEE_NOT_FOUND: 'Employee was not found. Reload and try again.',
  STAFF_CREDENTIAL_UPDATE_FAILED: 'The new password or email could not be saved. No changes were kept.',
  STAFF_INVITE_FORBIDDEN: 'You cannot create an account with this role.',
  STAFF_EDIT_FORBIDDEN: 'You do not have permission to edit employees.',
  HR_MANAGED_ROLE_SCOPE_REQUIRED: 'HR can only manage the roles enabled for HR in Owner Settings.',
  OWNER_PROFILE_PROTECTED: 'Owner accounts are managed by the Owner only.',
  STAFF_ROLE_DISABLED: 'The selected role is disabled in Owner Settings.',
  STAFF_AUTH_REMOVAL_FAILED: 'The login account could not be removed. The employee remains disabled and the removal can be retried.',
  STAFF_REMOVAL_FINALIZE_FAILED: 'The login was removed, but employee cleanup still needs to be retried.',
}

const messageFromBody = (body: { error?: string; message?: string; blockers?: unknown } | null | undefined, fallback: string): string => {
  if (!body) return fallback
  if (body.error === 'EMPLOYEE_REMOVAL_BLOCKED') return formatRemovalBlockers(body.blockers)
  if (body.error && STAFF_ERROR_MESSAGES[body.error]) return STAFF_ERROR_MESSAGES[body.error]
  return fallback
}

const staffFunctionError = async (error: unknown, fallback: string): Promise<Error> => {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = error.context
    if (context instanceof Response) {
      try {
        const body = await context.clone().json() as { error?: string; message?: string; blockers?:unknown }
        return new Error(messageFromBody(body, fallback))
      } catch {
        // Use the clear workflow fallback below.
      }
    }
  }
  return new Error(fallback)
}

const invokeStaffAdmin = async <T>(body: Record<string, unknown>, fallback: string): Promise<T> => {
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase Auth is not configured.')
  const { data, error } = await client.functions.invoke('staff-admin', { body })
  if (error) throw await staffFunctionError(error, fallback)
  if (data?.error) throw new Error(messageFromBody(data, fallback))
  return data as T
}

/** Creates the login and the HR employee together. */
export const provisionStaffAccountSupabase = async (input: ProvisionStaffInput): Promise<void> => {
  if (!isSupabaseConfigured()) return
  const redirectTo = typeof window === 'undefined' ? undefined : window.location.origin
  const { pin: _pin, ...employee } = input.employee
  await runHrServerMutation(() => invokeStaffAdmin({
    action: 'invite',
    employee,
    password: input.password,
    branchId: input.branchId,
    redirectTo,
  }, 'Unable to create the staff login account.'))
}

/**
 * Changes only the keys in `patch` (plus the password when given). Status
 * changes only when `patch.status` is sent, so saving a profile can never
 * re-activate a deactivated login.
 */
export const updateStaffEmployeeSupabase = async (employeeId: string, patch: StaffEmployeePatch, password?: string): Promise<void> => {
  if (!isSupabaseConfigured()) return
  await runHrServerMutation(() => invokeStaffAdmin({
    action: 'update',
    employeeId,
    patch,
    password: password || undefined,
  }, 'Unable to save the employee.'))
}

export const removeStaffEmployeeSupabase = async (employeeId:string, reason:string, forceResolve=false):Promise<void> => {
  if (!isSupabaseConfigured()) return
  const keys = forceResolve
    ? ['employees', 'attendance', 'attendanceReviewCases', 'employeePointEntries', 'employeeDefaultSchedules', 'scheduleOverrides', 'scheduleRevisions'] as const
    : ['employees', 'employeeDefaultSchedules', 'scheduleOverrides'] as const
  await runHrServerMutation(() => invokeStaffAdmin({
    action:'remove', employeeId, reason, forceResolve,
  }, 'Unable to permanently remove the employee.'), keys)
  if (forceResolve) await reloadOperationalDomain('payroll').catch(() => undefined)
}

/**
 * Local/demo mode only (no Supabase): mirrors the separation metadata the
 * server writes in update_staff_employee.
 */
export const applyLocalEmploymentStatusMetadata = (employeeId: string, status: Employee['status']): void => {
  const current = useHrStore.getState().employees.find((item) => item.id === employeeId)
  if (!current) return

  if (status === 'inactive') {
    const separatedAt = new Date().toISOString()
    const separatedBy = useUserStore.getState().name.trim() || 'HR'
    useHrStore.setState((state) => ({
      employees: state.employees.map((item) => item.id === employeeId ? {
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
      if (item.id !== employeeId) return item
      const { employmentEndDate: _employmentEndDate, separationReason: _separationReason, separatedAt: _separatedAt, separatedBy: _separatedBy, ...activeEmployee } = item
      return activeEmployee
    }),
  }))
}
