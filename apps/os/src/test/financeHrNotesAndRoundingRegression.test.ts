import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Finance and HR note and rounding regressions', () => {
  it('keeps multi-field and multi-line surfaces out of pill shapes', () => {
    const payroll = read('src/components/finance/FinancePayrollReview.tsx')
    const points = read('src/components/hr/HrPointsSection.tsx')
    expect(payroll).toContain('Record final payroll payment')
    expect(payroll).toContain('mt-4 rounded-2xl border border-border bg-card p-5')
    expect(payroll).not.toContain('paymentOpen&&<div className=\"mt-4 rounded-full')
    expect(points).toContain('min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm')
    expect(points).not.toContain('min-h-24 w-full rounded-full')
  })

  it('marks true Finance and HR notes optional while keeping reasons explicit', () => {
    const payroll = read('src/components/finance/FinancePayrollReview.tsx')
    const schedule = read('src/components/finance/FinancePayrollScheduleAdjustment.tsx')
    const attendance = read('src/components/hr/AttendanceReviewQueue.tsx')
    const points = read('src/components/hr/HrPointsSection.tsx')
    expect(payroll).toContain('Group approval note · Optional')
    expect(payroll).toContain('Employee approval note · Optional')
    expect(payroll).toContain('Note · Optional')
    expect(payroll).toContain('Employee rejection reason for HR · Required')
    expect(schedule).toContain('Changes apply immediately after validation.')
    expect(schedule).not.toContain('Approval note')
    expect(schedule).not.toContain('Rejection reason')
    expect(attendance).toContain('Review note · Optional')
    expect(points).toContain('Review note · Optional')
    expect(points).toContain('Rejection reason · Required')
  })

  it('does not require optional approval or review notes in stores', () => {
    const payrollStore = read('src/store/payrollStore.ts')
    const hrStore = read('src/store/hrStore.ts')
    const orderDomain = read('src/domain/orderWorkflowDomain.ts')
    expect(payrollStore).not.toContain('Finance approval note is required.')
    expect(payrollStore).not.toContain('Finance review note is required.')
    expect(payrollStore).not.toContain('Approval note is required.')
    expect(hrStore).not.toContain('Add a review note.')
    expect(hrStore).not.toContain('Add an approval note.')
    expect(orderDomain).toContain("if (decision === 'reject' && !note?.trim())")
  })
})
