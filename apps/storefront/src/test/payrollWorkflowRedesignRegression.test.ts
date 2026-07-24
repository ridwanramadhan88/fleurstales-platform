import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('payroll workflow redesign regressions', () => {
  it('keeps readiness visible and schedule settings out of the Payroll workspace', () => {
    const payroll = read('src/components/hr/HrPayrollSection.tsx')
    expect(payroll).toContain('Payroll readiness')
    expect(payroll).toContain('Resubmit to Finance')
    expect(payroll).not.toContain('PayrollScheduleCard')
  })

  it('keeps unfinished Finance proposals highlighted with shared badges and progress', () => {
    const review = read('src/components/finance/FinancePayrollReview.tsx')
    expect(review).toContain('PayrollStatusBadge')
    expect(review).toContain("border-warning/30 bg-warning/[0.025]")
    expect(review).toContain('Review proposal')
    expect(review).toContain('approvedRows.length / selectedDrafts.length')
  })

  it('uses People-style underline navigation for Payroll proposals and Refunds', () => {
    const payroll = read('src/components/finance/FinancePayrollReview.tsx')
    const refunds = read('src/components/finance/FinanceRefundQueue.tsx')
    expect(payroll).toContain("settingsTabTrackClass({ level: 'primary'")
    expect(payroll).toContain("settingsTabButtonClass({ active: view === item, level: 'primary'")
    expect(refunds).toContain("settingsTabTrackClass({ level: 'primary'")
    expect(refunds).toContain("settingsTabButtonClass({ active: activeTab === id, level: 'primary'")
  })

  it('includes every non-owner payroll role and protects Finance self-review', () => {
    const store = read('src/store/payrollStore.ts')
    expect(store).toContain("employee.systemRole !== 'owner'")
    expect(store).toContain("draft.employeeRole !== 'owner'")
    expect(store).toContain('isActorOwnPayroll')
  })
})
