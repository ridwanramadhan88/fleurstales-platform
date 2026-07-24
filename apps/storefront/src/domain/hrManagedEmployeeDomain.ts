import type { Employee } from '../store/hrStoreTypes'
import type { UserRole } from '../store/userStore'
import type { HrManagedRolesByArea, HrManagementArea } from '../types/settings'

/** Default roles managed by HR when older persisted settings do not include the new scope controls. */
const HR_MANAGED_EMPLOYEE_ROLES: readonly UserRole[] = ['admin', 'florist']

export const getHrManagedRoles = (
  area: HrManagementArea,
  configured?: Partial<HrManagedRolesByArea>,
): UserRole[] => configured?.[area] ?? [...HR_MANAGED_EMPLOYEE_ROLES]

export const isHrManagedEmployeeRole = (
  role: UserRole,
  area: HrManagementArea = 'employees',
  configured?: Partial<HrManagedRolesByArea>,
): boolean => getHrManagedRoles(area, configured).includes(role)

export const isHrManagedEmployee = (
  employee: Pick<Employee, 'systemRole'>,
  area: HrManagementArea = 'employees',
  configured?: Partial<HrManagedRolesByArea>,
): boolean => isHrManagedEmployeeRole(employee.systemRole, area, configured)

/** Owner may manage every non-owner account. HR is limited by Owner Settings. */
export const canActorManageEmployee = (
  actorRole: UserRole,
  employeeRole: UserRole,
  area: HrManagementArea,
  configured?: Partial<HrManagedRolesByArea>,
): boolean => actorRole === 'owner'
  ? employeeRole !== 'owner'
  : actorRole === 'hr' && isHrManagedEmployeeRole(employeeRole, area, configured)

export const HR_PROTECTED_ROLE_MESSAGE =
  'This account is outside the HR management scope configured by Owner.'
