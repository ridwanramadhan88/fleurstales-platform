import { beforeEach, describe, expect, it } from 'vitest'
import { useHrStore } from './hrStore'
import type { Employee } from './hrStoreTypes'
import { usePayrollStore, type EmployeeCompensation, type PayrollPeriod } from './payrollStore'

const period: PayrollPeriod = {
  id: 'period-roles',
  periodStart: '2027-01-21',
  periodEnd: '2027-02-20',
  hrSubmissionDeadline: '2027-02-24',
  financeReviewDeadline: '2027-02-27',
  paymentDate: '2027-02-28',
  status: 'hr_preparation',
  createdAt: '2027-01-21T00:00:00.000Z',
  source: 'owner_defaults',
}

const employees: Employee[] = [
  { id:'emp-owner', name:'Budi', position:'Owner', branch:'', systemRole:'owner', status:'active', phone:'', hireDate:'2021-01-01', baseSalaryIdr:7_000_000 },
  { id:'emp-finance', name:'Dewi', position:'Finance', branch:'', systemRole:'finance', status:'active', phone:'', hireDate:'2022-01-01', baseSalaryIdr:5_000_000 },
  { id:'emp-hr', name:'Bintang', position:'HR', branch:'', systemRole:'hr', status:'active', phone:'', hireDate:'2022-01-01', baseSalaryIdr:4_500_000 },
  { id:'emp-admin', name:'Akbar', position:'Admin', branch:'', systemRole:'admin', status:'active', phone:'', hireDate:'2022-01-01', baseSalaryIdr:4_500_000 },
  { id:'emp-florist', name:'Zahra', position:'Florist', branch:'', systemRole:'florist', status:'active', phone:'', hireDate:'2022-01-01', baseSalaryIdr:4_000_000 },
]

const compensations: EmployeeCompensation[] = employees
  .filter((employee) => employee.systemRole !== 'owner')
  .map((employee) => ({
    id:`comp-${employee.id}`,
    employeeId:employee.id,
    baseSalaryIdr:employee.baseSalaryIdr!,
    effectiveFrom:'2026-01-01',
    createdBy:'Test setup',
    createdAt:'2026-01-01T00:00:00.000Z',
  }))

beforeEach(() => {
  useHrStore.setState({
    employees,
    attendance:[],
    attendanceReviewCases:[],
    employeePointEntries:[],
    generateAttendanceWarnings:() => 0,
  })
  usePayrollStore.setState({
    periods:[period],
    compensations,
    employeePayrolls:[],
    payrollReviews:[],
    payrollProposals:[],
    payrollProposalReviews:[],
    payrollScheduleAdjustments:[],
  })
})

describe('payroll role eligibility and independent Finance review', () => {
  it('includes Admin, Florist, HR, and Finance while excluding Owner', () => {
    const hr = { name:'Bintang', role:'hr' as const }
    expect(usePayrollStore.getState().generateEmployeePayrollDrafts({ payrollPeriodId:period.id, actor:hr }).ok).toBe(true)

    const drafts = usePayrollStore.getState().employeePayrolls
    expect(drafts.map((draft) => draft.employeeRole).sort()).toEqual(['admin','finance','florist','hr'])
    expect(drafts.some((draft) => draft.employeeRole === 'owner')).toBe(false)

    expect(usePayrollStore.getState().submitPayrollToFinance({ payrollPeriodId:period.id, actor:hr }).ok).toBe(true)
    const proposal = usePayrollStore.getState().payrollProposals[0]
    expect(proposal.employeePayrollIds).toHaveLength(4)
    expect(usePayrollStore.getState().employeePayrolls.every((draft) => draft.status === 'pending_finance_review')).toBe(true)
  })

  it('prevents Finance self-review by employee id or matching account name', () => {
    const hr = { name:'Bintang', role:'hr' as const }
    usePayrollStore.getState().generateEmployeePayrollDrafts({ payrollPeriodId:period.id, actor:hr })
    usePayrollStore.getState().submitPayrollToFinance({ payrollPeriodId:period.id, actor:hr })

    const state = usePayrollStore.getState()
    const financeDraft = state.employeePayrolls.find((draft) => draft.employeeRole === 'finance')!
    const proposal = state.payrollProposals[0]
    const demoFinance = { employeeId:'demo-finance', name:'Dewi', role:'finance' as const }

    expect(usePayrollStore.getState().verifyEmployeePayroll({ payrollDraftId:financeDraft.id, note:'', actor:demoFinance }))
      .toMatchObject({ ok:false, code:'forbidden' })
    expect(usePayrollStore.getState().approvePayrollProposal({ payrollProposalId:proposal.id, note:'', actor:demoFinance }))
      .toMatchObject({ ok:false, code:'forbidden' })

    expect(usePayrollStore.getState().verifyEmployeePayroll({
      payrollDraftId:financeDraft.id,
      note:'Independent review complete.',
      actor:{ employeeId:'emp-owner', name:'Budi', role:'owner' },
    }).ok).toBe(true)

    expect(usePayrollStore.getState().approvePayrollProposal({ payrollProposalId:proposal.id, note:'', actor:demoFinance }).ok).toBe(true)
    expect(usePayrollStore.getState().payrollProposals[0].status).toBe('finance_approved')
  })
})
