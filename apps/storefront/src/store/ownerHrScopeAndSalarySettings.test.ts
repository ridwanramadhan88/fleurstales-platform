import { beforeEach, describe, expect, it } from 'vitest'
import { useHrStore } from './hrStore'
import { usePayrollStore } from './payrollStore'
import { useSettingsStore } from './settingsStore'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'

const initialEmployees = useHrStore.getState().employees
const initialCompensations = usePayrollStore.getState().compensations
const owner = { name: 'Budi', role: 'owner' as const }
const hr = { name: 'Star', role: 'hr' as const }

beforeEach(() => {
  useSettingsStore.getState().resetSettings()
  useHrStore.setState({ employees: initialEmployees, attendance: [], employeePointEntries: [] })
  usePayrollStore.setState({ periods: [], employeePayrolls: [], compensations: initialCompensations })
})

describe('Owner HR scope and salary settings', () => {
  it('lets Owner manage a Finance account while HR remains limited by Owner Settings', () => {
    const finance = initialEmployees.find((employee) => employee.systemRole === 'finance')!
    expect(useHrStore.getState().updateEmployeeProfile({ employeeId: finance.id, name: 'Finance Updated', phone: finance.phone, hireDate: finance.hireDate, actor: owner }).ok).toBe(true)
    expect(useHrStore.getState().updateEmployeeProfile({ employeeId: finance.id, name: 'HR Attempt', phone: finance.phone, hireDate: finance.hireDate, actor: hr }).ok).toBe(false)
  })

  it('allows Owner to include Finance accounts in HR employee management', () => {
    useSettingsStore.getState().updateStaffRoles({
      hrManagedRoles: {
        ...DEFAULT_OWNER_SETTINGS.staffRoles.hrManagedRoles!,
        employees: ['admin', 'finance', 'florist'],
      },
    })
    const finance = initialEmployees.find((employee) => employee.systemRole === 'finance')!
    expect(useHrStore.getState().updateEmployeeProfile({ employeeId: finance.id, name: 'Managed by HR', phone: finance.phone, hireDate: finance.hireDate, actor: hr }).ok).toBe(true)
  })

  it('uses the employee-specific base salary when no effective compensation override exists', () => {
    usePayrollStore.setState({ compensations: initialCompensations.filter((item) => item.employeeId !== 'emp-vero') })
    expect(useHrStore.getState().updateEmployeeBaseSalary('emp-vero', 4_250_000, owner).ok).toBe(true)
    const period = usePayrollStore.getState().ensureCurrentPeriod(new Date('2026-08-23T00:00:00Z'))
    const result = usePayrollStore.getState().generateEmployeePayrollDrafts({ payrollPeriodId: period.id, actor: hr })
    expect(result.ok).toBe(true)
    expect(usePayrollStore.getState().employeePayrolls.find((draft) => draft.employeeId === 'emp-vero')?.baseSalaryIdr).toBe(4_250_000)
  })
})
