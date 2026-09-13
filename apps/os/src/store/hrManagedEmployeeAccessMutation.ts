import { isActionAuthorized } from '../config/authorization'
import { canActorManageEmployee, isHrManagedEmployeeRole, HR_PROTECTED_ROLE_MESSAGE } from '../domain/hrManagedEmployeeDomain'
import { isStrongStaffPassword, STAFF_PASSWORD_HELP } from '../domain/staffCredentialDomain'
import { normalizeUsername } from '../domain/staffAccountDomain'
import { useSettingsStore } from './settingsStore'
import { getEmployeeRoleLabel, useHrStore, type HrEmployeeCommandField, type HrEmployeeCommandResult } from './hrStore'

let installed = false

const errorResult = (
  code: Exclude<HrEmployeeCommandResult, { ok: true }>['code'],
  reason: string,
  field?: HrEmployeeCommandField,
): HrEmployeeCommandResult => ({
  ok: false,
  code,
  reason,
  fieldErrors: field ? { [field]: reason } : undefined,
})

/**
 * Extends the legacy HR store access mutation for HR operators. Server-side
 * authority still comes from sync_staff_access_profile; this keeps the local
 * operational snapshot in sync after that RPC succeeds.
 */
export const installHrManagedEmployeeAccessMutation = (): void => {
  if (installed) return

  const original = useHrStore.getState().updateEmployeeAccess
  const patched: typeof original = ({ employeeId, systemRole, email, username, pin, productionAuth = false, actor }) => {
    if (actor.role !== 'hr') {
      return original({ employeeId, systemRole, email, username, pin, productionAuth, actor })
    }
    if (!isActionAuthorized(actor.role, 'hr.edit_employee')) {
      return errorResult('forbidden', 'This role cannot edit employees.')
    }

    let result: HrEmployeeCommandResult = errorResult('unknown', 'Employee access could not be updated.')
    useHrStore.setState((state) => {
      const employee = state.employees.find((item) => item.id === employeeId)
      if (!employee) {
        result = errorResult('not_found', 'Employee record was not found.')
        return state
      }

      const settings = useSettingsStore.getState()
      const managedRoles = settings.staffRoles.hrManagedRoles
      if (
        employee.systemRole === 'owner' ||
        systemRole === 'owner' ||
        !canActorManageEmployee('hr', employee.systemRole, 'employees', managedRoles) ||
        !isHrManagedEmployeeRole(systemRole, 'employees', managedRoles)
      ) {
        result = errorResult('forbidden', HR_PROTECTED_ROLE_MESSAGE, 'systemRole')
        return state
      }
      if (!settings.staffRoles.roles.includes(systemRole)) {
        result = errorResult('disabled_role', 'The selected role is disabled in Owner Settings.', 'systemRole')
        return state
      }

      const nextEmail = email?.trim().toLowerCase()
      const nextUsername = normalizeUsername(username ?? employee.username ?? '')
      if (nextEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        result = errorResult('invalid_email', 'Enter a valid recovery email address.', 'email')
        return state
      }
      if (nextEmail && state.employees.some((item) => item.id !== employeeId && item.email?.trim().toLowerCase() === nextEmail)) {
        result = errorResult('duplicate_email', 'Email is already in use.', 'email')
        return state
      }
      if (!nextUsername || !/^[a-z][a-z0-9._-]*$/.test(nextUsername)) {
        result = errorResult('invalid_username', 'Username must be lowercase and start with a letter.', 'username')
        return state
      }
      if (state.employees.some((item) => item.id !== employeeId && item.username === nextUsername)) {
        result = errorResult('duplicate_username', 'Username is already in use.', 'username')
        return state
      }
      if (pin && !isStrongStaffPassword(pin)) {
        result = errorResult('invalid_pin', STAFF_PASSWORD_HELP, 'pin')
        return state
      }

      result = { ok: true, employeeId }
      return {
        employees: state.employees.map((item) => item.id === employeeId ? {
          ...item,
          systemRole,
          position: getEmployeeRoleLabel(systemRole),
          email: nextEmail !== undefined ? nextEmail : item.email,
          username: nextUsername,
          pin: pin && !productionAuth ? pin : item.pin,
        } : item),
      }
    })
    return result
  }

  useHrStore.setState({ updateEmployeeAccess: patched })
  installed = true
}
