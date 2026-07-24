import { describe, expect, it } from 'vitest'
import { buildPayrollScheduleForPaymentMonth, getCurrentPayrollSchedule, getPayrollScheduleStage } from './payrollScheduleDomain'
import type { PayrollDefaultSettings } from '../types/settings'

const settings: PayrollDefaultSettings = {
  frequency: 'monthly', periodStartDay: 21, periodEndDay: 20,
  hrSubmissionDay: 24, financeReviewDay: 27, paymentDay: 28,
  timezone: 'Asia/Jakarta', pointValueIdr: 1000,
}

describe('payroll schedule domain', () => {
  it('builds the 21st to 20th cycle for an August payment', () => {
    expect(buildPayrollScheduleForPaymentMonth(2026, 8, settings)).toEqual({
      periodStart: '2026-07-21', periodEnd: '2026-08-20',
      hrSubmissionDeadline: '2026-08-24', financeReviewDeadline: '2026-08-27', paymentDate: '2026-08-28',
    })
  })
  it('moves to the next payment month after payment day', () => {
    expect(getCurrentPayrollSchedule(new Date('2026-08-29T05:00:00Z'), settings).paymentDate).toBe('2026-09-28')
  })
  it('derives schedule stages', () => {
    const cycle = buildPayrollScheduleForPaymentMonth(2026, 8, settings)
    expect(getPayrollScheduleStage(cycle, '2026-08-22')).toBe('hr_preparation')
    expect(getPayrollScheduleStage(cycle, '2026-08-26')).toBe('finance_review')
    expect(getPayrollScheduleStage(cycle, '2026-08-28')).toBe('payment_due')
  })
})
