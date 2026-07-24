import type { Employee } from '../store/hrStoreTypes'
import type { UserRole } from '../store/userStore'
import type { HrManagedRolesByArea } from '../types/settings'
import { getHrManagedRoles } from './hrManagedEmployeeDomain'

export interface StaffAccountActor { name: string; role: UserRole }
export type StaffAccountResult = { ok: true } | { ok: false; reason: string }

export const normalizeUsername = (value: string): string => value.trim().toLowerCase()
const isValidUsername = (value: string): boolean => /^[a-z][a-z0-9._-]*$/.test(value)
const isValidPin = (value: string): boolean => /^\d{6}$/.test(value)

/**
 * Which roles an actor may create accounts for. Owner may create any
 * non-Owner role. HR is limited to the 'employees' area of the
 * Owner-configured `staffRoles.hrManagedRoles` (Settings → Staff & Roles),
 * which defaults to Admin and Florist.
 */
export const getCreatableAccountRoles = (
  actorRole: UserRole,
  hrManagedRoles?: Partial<HrManagedRolesByArea>,
): UserRole[] => {
  if (actorRole === 'owner') return ['admin', 'finance', 'hr', 'florist']
  if (actorRole === 'hr') return getHrManagedRoles('employees', hrManagedRoles)
  return []
}

const canCreateAccountForRole = (
  actorRole: UserRole,
  targetRole: UserRole,
  hrManagedRoles?: Partial<HrManagedRolesByArea>,
): boolean => getCreatableAccountRoles(actorRole, hrManagedRoles).includes(targetRole)

export const canCreateStaffAccount = (params: {
  employees: Employee[]
  username: string
  pin: string
  systemRole: UserRole
  actor: StaffAccountActor
  hrManagedRoles?: Partial<HrManagedRolesByArea>
}): StaffAccountResult => {
  if (!canCreateAccountForRole(params.actor.role, params.systemRole, params.hrManagedRoles)) {
    const reason = params.actor.role === 'hr'
      ? 'HR can only create accounts for the roles Owner has assigned to HR in Staff & Roles settings (Admin and Florist by default).'
      : params.actor.role === 'owner'
        ? 'Owner cannot create another Owner account.'
        : 'This role cannot create employee accounts.'
    return { ok: false, reason }
  }
  const username = normalizeUsername(params.username)
  if (!isValidUsername(username)) return { ok: false, reason: 'Username must be lowercase and start with a letter. Use only letters, numbers, dots, underscores, or hyphens.' }
  if (!isValidPin(params.pin)) return { ok: false, reason: 'PIN must contain exactly 6 numbers.' }
  if (params.employees.some((employee) => employee.username === username)) return { ok: false, reason: 'Username is already in use.' }
  return { ok: true }
}

export const canChangeEmployeeRole = (params: {
  employees: Employee[]
  employeeId: string
  nextRole: UserRole
  actor: StaffAccountActor
}): StaffAccountResult => {
  if (params.actor.role !== 'owner') return { ok: false, reason: 'Only Owner can edit employee roles.' }
  const employee = params.employees.find((item) => item.id === params.employeeId)
  if (!employee) return { ok: false, reason: 'Employee account was not found.' }
  if (employee.systemRole === params.nextRole) return { ok: false, reason: 'Employee already has this role.' }
  if (employee.systemRole === 'owner' && params.nextRole !== 'owner') {
    const activeOwners = params.employees.filter((item) => item.status === 'active' && item.systemRole === 'owner')
    if (activeOwners.length <= 1) return { ok: false, reason: 'The last active Owner role cannot be reassigned.' }
  }
  return { ok: true }
}
