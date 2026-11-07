import { beforeEach, describe, expect, it } from 'vitest'
import { usePayrollStore } from './payrollStore'
import { useHrStore } from './hrStore'
import type { AttendanceReviewCase } from './hrStoreTypes'
import { buildCheckoutWarnings } from '../domain/attendanceReviewDomain'
import { DEFAULT_OWNER_SETTINGS } from '../domain/settings/defaultOwnerSettings'

const hr = { name:'Star', role:'hr' as const }
const initialCompensations = usePayrollStore.getState().compensations

const overtimeCase = (patch: Partial<AttendanceReviewCase> = {}): AttendanceReviewCase => ({
  id:'review-att-1-overtime', attendanceId:'att-1', employeeId:'emp-vero', date:'2026-08-12', warningType:'overtime', status:'pending',
  reason:'Employee claimed overtime', minutesDifference:95, createdAt:'2026-08-12T12:00:00.000Z', ...patch,
})

beforeEach(() => {
  usePayrollStore.setState({ periods:[], employeePayrolls:[], payrollProposals:[], compensations:initialCompensations })
  useHrStore.setState({ employeePointEntries:[], attendanceReviewCases:[overtimeCase()] })
})

const generate = () => {
  const period = usePayrollStore.getState().ensureCurrentPeriod(new Date('2026-08-23T00:00:00Z'))
  expect(usePayrollStore.getState().generateEmployeePayrollDrafts({ payrollPeriodId:period.id, actor:hr }).ok).toBe(true)
  return usePayrollStore.getState().employeePayrolls.find((item) => item.employeeId === 'emp-vero')!
}

describe('overtime from attendance and itemised payroll additions', () => {
  it('only creates an overtime review when the employee chose overtime', () => {
    const employee = { id:'emp-vero', name:'Vero', position:'Florist', branch:'Kedamaian' as const, systemRole:'florist' as const, status:'active' as const, phone:'', hireDate:'2026-01-01', username:'vero', pin:'x' }
    const overrides = [{ id:'s', employeeId:'emp-vero', date:'2026-08-12', shift:{ mode:'custom' as const, isWorking:true, branchId:'Kedamaian', startTime:'08:00', endTime:'16:00' }, updatedAt:'', updatedBy:'HR' }]
    const record = { id:'att-1', employeeId:'emp-vero', date:'2026-08-12', status:'present' as const, actor:'Vero', createdAt:'', checkInAt:'2026-08-12T01:00:00.000Z', checkOutAt:'2026-08-12T10:35:00.000Z' }
    const settings = DEFAULT_OWNER_SETTINGS
    expect(buildCheckoutWarnings({ record:{ ...record, checkOutReason:'late_checkout' }, employee, defaults:[], overrides, settings })).toEqual([])
    const [claimed] = buildCheckoutWarnings({ record:{ ...record, checkOutReason:'overtime', checkOutReasonNote:'Wedding' }, employee, defaults:[], overrides, settings })
    expect(claimed).toMatchObject({ warningType:'overtime', minutesDifference:95, employeeNote:'Wedding' })
  })

  it('puts HR-approved overtime straight into payroll additions', () => {
    const before = generate()
    expect(before.hrAdjustments).toEqual([])
    const approval = useHrStore.getState().approveOvertimeCase({ caseId:'review-att-1-overtime', minutes:90, amountIdr:45_000, actor:hr })
    expect(approval.ok).toBe(true)
    expect(usePayrollStore.getState().syncOvertimeAdditionsForEmployee({ employeeId:'emp-vero', date:'2026-08-12', actor:hr }).ok).toBe(true)
    const draft = usePayrollStore.getState().employeePayrolls.find((item) => item.employeeId === 'emp-vero')!
    expect(draft.hrAdjustments).toEqual([expect.objectContaining({ kind:'overtime', amountIdr:45_000, overtimeMinutes:90, attendanceCaseId:'review-att-1-overtime' })])
    expect(draft.hrAdjustmentIdr).toBe(45_000)
    expect(draft.finalPayrollIdr).toBe(before.finalPayrollIdr + 45_000)
    // Syncing again does not pay it twice.
    usePayrollStore.getState().syncOvertimeAdditionsForEmployee({ employeeId:'emp-vero', date:'2026-08-12', actor:hr })
    expect(usePayrollStore.getState().employeePayrolls.find((item) => item.employeeId === 'emp-vero')!.hrAdjustmentIdr).toBe(45_000)
  })

  it('includes approved overtime when payroll is generated later, and drops it when the approval is cancelled', () => {
    useHrStore.setState({ attendanceReviewCases:[overtimeCase({ status:'accepted', approvedOvertimeMinutes:60, approvedOvertimeAmountIdr:30_000 })] })
    const draft = generate()
    expect(draft.hrAdjustmentIdr).toBe(30_000)
    expect(useHrStore.getState().revokeOvertimeApproval({ caseId:'review-att-1-overtime', actor:hr }).ok).toBe(true)
    usePayrollStore.getState().syncOvertimeAdditionsForEmployee({ employeeId:'emp-vero', date:'2026-08-12', actor:hr })
    expect(usePayrollStore.getState().employeePayrolls.find((item) => item.employeeId === 'emp-vero')!.hrAdjustmentIdr).toBe(0)
  })

  it('adds and removes manual lines; deductions are negative and cannot go below base salary', () => {
    const draft = generate()
    const store = usePayrollStore.getState()
    expect(store.addEmployeePayrollAdditionLine({ payrollDraftId:draft.id, kind:'fee', amountIdr:150_000, reason:'Fee instalasi Hotel X', actor:hr }).ok).toBe(true)
    expect(store.addEmployeePayrollAdditionLine({ payrollDraftId:draft.id, kind:'deduction', amountIdr:50_000, reason:'Kasbon 1 Nov', actor:hr }).ok).toBe(true)
    let current = usePayrollStore.getState().employeePayrolls.find((item) => item.id === draft.id)!
    expect(current.hrAdjustments?.map((line) => [line.kind, line.amountIdr])).toEqual([['fee', 150_000], ['deduction', -50_000]])
    expect(current.hrAdjustmentIdr).toBe(100_000)
    expect(store.addEmployeePayrollAdditionLine({ payrollDraftId:draft.id, kind:'bonus', amountIdr:10_000, reason:' ', actor:hr }).ok).toBe(false)
    expect(store.addEmployeePayrollAdditionLine({ payrollDraftId:draft.id, kind:'deduction', amountIdr:10_000_000, reason:'Terlalu besar', actor:hr })).toMatchObject({ ok:false, code:'calculation_mismatch' })
    // Removing the fee would leave only the deduction, taking pay below the base salary.
    const fee = current.hrAdjustments!.find((line) => line.kind === 'fee')!
    expect(store.removeEmployeePayrollAdditionLine({ payrollDraftId:draft.id, lineId:fee.id, actor:hr })).toMatchObject({ ok:false, code:'calculation_mismatch' })
    const deduction = current.hrAdjustments!.find((line) => line.kind === 'deduction')!
    expect(store.removeEmployeePayrollAdditionLine({ payrollDraftId:draft.id, lineId:deduction.id, actor:hr }).ok).toBe(true)
    current = usePayrollStore.getState().employeePayrolls.find((item) => item.id === draft.id)!
    expect(current.hrAdjustmentIdr).toBe(150_000)
  })

  it('keeps manual lines when payroll is regenerated', () => {
    const draft = generate()
    usePayrollStore.getState().addEmployeePayrollAdditionLine({ payrollDraftId:draft.id, kind:'allowance', amountIdr:200_000, reason:'Tunjangan transport', actor:hr })
    const again = generate()
    expect(again.hrAdjustments?.map((line) => line.kind)).toEqual(['allowance'])
    expect(again.hrAdjustmentIdr).toBe(200_000)
  })
})
