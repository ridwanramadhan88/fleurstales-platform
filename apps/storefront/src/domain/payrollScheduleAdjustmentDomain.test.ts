import { describe, expect, it } from 'vitest'
import { evaluatePayrollScheduleAdjustment, payrollPeriodsOverlap, validatePayrollScheduleSnapshot } from './payrollScheduleAdjustmentDomain'

const current = { periodStart:'2026-07-21', periodEnd:'2026-08-20', hrSubmissionDeadline:'2026-08-24', financeReviewDeadline:'2026-08-27', paymentDate:'2026-08-28' }

describe('payroll schedule adjustment domain', () => {
  it('validates chronological schedule dates', () => {
    expect(validatePayrollScheduleSnapshot(current).ok).toBe(true)
    const result = validatePayrollScheduleSnapshot({ ...current, paymentDate:'2026-08-23' })
    expect(result.ok).toBe(false)
  })
  it('allows a normal same-period deadline adjustment without owner approval', () => {
    const impact = evaluatePayrollScheduleAdjustment({ current, proposed:{ ...current, financeReviewDeadline:'2026-08-26' }, today:'2026-08-21', hasSubmittedPayrolls:false, hasVerifiedPayrolls:false })
    expect(impact.requiresOwnerApproval).toBe(false)
  })
  it('requires owner approval for sensitive changes', () => {
    const impact = evaluatePayrollScheduleAdjustment({ current, proposed:{ ...current, periodEnd:'2026-08-21', hrSubmissionDeadline:'2026-08-25' }, today:'2026-08-21', hasSubmittedPayrolls:true, hasVerifiedPayrolls:false })
    expect(impact.requiresOwnerApproval).toBe(true)
    expect(impact.reasons.length).toBeGreaterThan(0)
  })
  it('detects overlapping earning periods', () => {
    expect(payrollPeriodsOverlap(current, { ...current, periodStart:'2026-08-20', periodEnd:'2026-09-20' })).toBe(true)
    expect(payrollPeriodsOverlap(current, { ...current, periodStart:'2026-08-21', periodEnd:'2026-09-20' })).toBe(false)
  })
})
