import { describe, expect, it } from 'vitest'
import { validatePayrollForFinance } from './payrollFinanceReviewDomain'
import type { EmployeePayrollDraft } from '../store/payrollStore'

const draft = (): EmployeePayrollDraft => ({
  id:'draft-1', payrollPeriodId:'payroll-2026-08', employeeId:'emp-agus', employeeName:'Agus', employeeRole:'florist',
  baseSalaryIdr:4_000_000, positivePoints:20, negativePoints:-5, netPoints:15, bonusIdr:15_000, finalPayrollIdr:4_015_000,
  pointEntries:[
    { id:'p1', category:'florist_assignment', points:20, reason:'Order', sourceType:'order', sourceId:'order:1', createdAt:'2026-08-01T00:00:00.000Z' },
    { id:'p2', category:'attendance_penalty', points:-5, reason:'Late', sourceType:'attendance_review', sourceId:'attendance:1', createdAt:'2026-08-02T00:00:00.000Z' },
  ],
  status:'pending_finance_review', generatedAt:'2026-08-21T00:00:00.000Z', generatedBy:'HR', submittedAt:'2026-08-24T00:00:00.000Z', submittedBy:'HR',
})

describe('payroll finance validation', () => {
  it('accepts a reconciled frozen payroll snapshot', () => {
    expect(validatePayrollForFinance(draft())).toEqual({ ok:true })
  })

  it('rejects calculation mismatch and duplicate evidence', () => {
    expect(validatePayrollForFinance({ ...draft(), finalPayrollIdr:4_999_999 })).toMatchObject({ ok:false })
    const duplicate = draft()
    duplicate.pointEntries = [...duplicate.pointEntries, { ...duplicate.pointEntries[0], id:'p3' }]
    duplicate.positivePoints = 40
    duplicate.netPoints = 35
    duplicate.bonusIdr = 35_000
    duplicate.finalPayrollIdr = 4_035_000
    expect(validatePayrollForFinance(duplicate)).toMatchObject({ ok:false, reason:'Payroll contains duplicate point evidence from the same source.' })
  })
})
