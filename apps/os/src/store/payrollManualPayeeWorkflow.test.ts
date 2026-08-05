import { beforeEach, describe, expect, it } from 'vitest'
import { usePayrollStore, type EmployeePayrollDraft, type PayrollPeriod } from './payrollStore'
import { useHrStore } from './hrStore'

const period: PayrollPeriod = {
  id:'payroll-2026-08',
  periodStart:'2026-07-21',
  periodEnd:'2026-08-20',
  hrSubmissionDeadline:'2026-08-24',
  financeReviewDeadline:'2026-08-27',
  paymentDate:'2026-08-28',
  status:'hr_preparation',
  createdAt:'2026-08-01T00:00:00.000Z',
  source:'owner_defaults',
}

const financeDraft: EmployeePayrollDraft = {
  id:'draft-finance',
  payrollPeriodId:period.id,
  employeeId:'finance-1',
  employeeName:'Finance One',
  employeeRole:'finance',
  entryMode:'generated',
  baseSalaryIdr:5_000_000,
  positivePoints:0,
  negativePoints:0,
  netPoints:0,
  bonusIdr:0,
  finalPayrollIdr:5_000_000,
  pointEntries:[],
  status:'pending_finance_review',
  generatedAt:'2026-08-20T00:00:00.000Z',
  generatedBy:'HR',
  submittedAt:'2026-08-21T00:00:00.000Z',
  submittedBy:'HR',
}

describe('manual payroll payees and Finance self-approval', () => {
  beforeEach(() => {
    usePayrollStore.setState({
      periods:[period],
      compensations:[],
      employeePayrolls:[],
      payrollReviews:[],
      payrollProposals:[],
      payrollProposalReviews:[],
      payrollScheduleAdjustments:[],
    })
    useHrStore.setState({ employees:[], employeePointEntries:[], attendanceReviewCases:[] })
  })

  it('lets HR add Owner and part-time payees manually', () => {
    const owner = usePayrollStore.getState().saveManualPayrollDraft({
      payrollPeriodId:period.id,
      payeeName:'Titi',
      payeeType:'owner',
      amountIdr:10_000_000,
      reason:'Owner monthly compensation',
      actor:{ name:'HR', role:'hr' },
    })
    const partTime = usePayrollStore.getState().saveManualPayrollDraft({
      payrollPeriodId:period.id,
      payeeName:'Weekend Helper',
      payeeType:'part_time',
      amountIdr:1_250_000,
      reason:'Part-time shifts during the payroll period',
      actor:{ name:'HR', role:'hr' },
    })

    expect(owner.ok).toBe(true)
    expect(partTime.ok).toBe(true)
    expect(usePayrollStore.getState().employeePayrolls).toEqual(expect.arrayContaining([
      expect.objectContaining({ employeeName:'Titi', entryMode:'manual', manualPayeeType:'owner', finalPayrollIdr:10_000_000 }),
      expect.objectContaining({ employeeName:'Weekend Helper', entryMode:'manual', manualPayeeType:'part_time', finalPayrollIdr:1_250_000 }),
    ]))
  })

  it('allows Finance to approve its own HR-submitted payroll and records that fact', () => {
    usePayrollStore.setState({
      employeePayrolls:[financeDraft],
      payrollProposals:[{
        id:'proposal-1',
        payrollPeriodId:period.id,
        status:'submitted_to_finance',
        employeePayrollIds:[financeDraft.id],
        totalBaseSalaryIdr:5_000_000,
        totalBonusIdr:0,
        totalAdjustmentsIdr:0,
        totalPayrollIdr:5_000_000,
        createdAt:'2026-08-21T00:00:00.000Z',
        createdBy:'HR',
        submittedAt:'2026-08-21T00:00:00.000Z',
        submittedBy:'HR',
      }],
    })

    const result = usePayrollStore.getState().verifyEmployeePayroll({
      payrollDraftId:financeDraft.id,
      actor:{ employeeId:'finance-1', name:'Finance One', role:'finance' },
    })

    expect(result.ok).toBe(true)
    expect(usePayrollStore.getState().employeePayrolls[0].status).toBe('finance_verified')
    expect(usePayrollStore.getState().payrollReviews.at(-1)).toMatchObject({
      decision:'verified',
      selfApproval:true,
      actorName:'Finance One',
    })
  })
})
