import { beforeEach, describe, expect, it } from 'vitest'
import { useHrStore } from './hrStore'
import { usePayrollStore } from './payrollStore'
import { useSettingsStore } from './settingsStore'

const hrActor = { name: 'Star', role: 'hr' as const }
const initialEmployees = structuredClone(useHrStore.getState().employees)

describe('authoritative permission integrity', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings()
    useHrStore.setState({
      employees: structuredClone(initialEmployees),
      attendance: [],
      attendanceReviewCases: [],
      employeePointEntries: [],
      employeeDefaultSchedules: [],
      scheduleOverrides: [],
    })
    usePayrollStore.setState({ periods: [], employeePayrolls: [], payrollProposals: [] })
  })

  it('blocks direct employee creation when the HR action is disabled', () => {
    useSettingsStore.getState().updateRoleActionPermission('hr', 'hr.create_employee', false)
    const result = useHrStore.getState().addEmployee({
      name: 'Blocked User', position: 'Florist', branch: 'Kedamaian', systemRole: 'florist', phone: '', hireDate: '2026-07-10', actor: hrActor,
    })
    expect(result).toMatchObject({ ok: false, code: 'forbidden' })
    expect(useHrStore.getState().employees.some((employee) => employee.name === 'Blocked User')).toBe(false)
  })

  it('blocks direct employee edits, attendance corrections, and point changes when disabled', () => {
    const employee = useHrStore.getState().employees.find((item) => item.systemRole === 'florist')!
    useSettingsStore.getState().updateRoleActionPermission('hr', 'hr.edit_employee', false)
    expect(useHrStore.getState().updateEmployeeProfile({ employeeId: employee.id, name: 'Changed', phone: '', hireDate: employee.hireDate, actor: hrActor })).toMatchObject({ ok: false, code: 'forbidden' })

    useSettingsStore.getState().updateRoleActionPermission('hr', 'hr.correct_attendance', false)
    expect(useHrStore.getState().recordAttendance({ employeeId: employee.id, date: '2026-07-10', status: 'present', actor: hrActor })).toBe(false)

    useSettingsStore.getState().updateRoleActionPermission('hr', 'hr.manage_points', false)
    expect(useHrStore.getState().createManualPointAdjustment({ employeeId: employee.id, points: 5, reason: 'Blocked', actor: hrActor })).toMatchObject({ ok: false })
  })

  it('blocks payroll proposal generation when the HR capability is disabled', () => {
    useSettingsStore.getState().updateRoleActionPermission('hr', 'hr.create_payroll_proposal', false)
    const period = usePayrollStore.getState().ensureCurrentPeriod(new Date('2026-08-23T00:00:00Z'))
    expect(usePayrollStore.getState().generateEmployeePayrollDrafts({ payrollPeriodId: period.id, actor: hrActor })).toMatchObject({ ok: false, code: 'forbidden' })
  })

  it('keeps Florist inside the HR-managed staff scope', () => {
    const florist = useHrStore.getState().employees.find((item) => item.systemRole === 'florist')!
    expect(useHrStore.getState().updateEmployeeProfile({ employeeId: florist.id, name: 'Changed Florist', phone: '', hireDate: florist.hireDate, actor: hrActor })).toMatchObject({ ok: true })
    expect(useHrStore.getState().recordAttendance({ employeeId: florist.id, date: '2026-07-10', status: 'present', actor: hrActor })).toBe(true)
    expect(useHrStore.getState().createManualPointAdjustment({ employeeId: florist.id, points: 5, reason: 'Approved', actor: hrActor })).toMatchObject({ ok: true })
  })

  it('rejects non-owner writes at the authoritative Settings section boundary', () => {
    const before = useSettingsStore.getState().storeProfile.storeName
    useSettingsStore.getState().applySettingsSection('store-profile', { ...useSettingsStore.getState().storeProfile, storeName: 'Unauthorized' }, 'hr')
    expect(useSettingsStore.getState().storeProfile.storeName).toBe(before)
  })
})
