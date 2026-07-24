import { beforeEach, describe, expect, it } from 'vitest'
import { usePayrollStore, type PayrollPeriod } from './payrollStore'

const period:PayrollPeriod = { id:'payroll-2026-08', periodStart:'2026-07-21', periodEnd:'2026-08-20', hrSubmissionDeadline:'2026-08-24', financeReviewDeadline:'2026-08-27', paymentDate:'2026-08-28', status:'hr_preparation', createdAt:'2026-08-21T00:00:00.000Z', source:'owner_defaults' }

beforeEach(() => usePayrollStore.setState({ periods:[period], employeePayrolls:[], payrollScheduleAdjustments:[] }))

describe('direct payroll schedule editing', () => {
  it('lets Finance apply a valid date change immediately', () => {
    const result = usePayrollStore.getState().adjustPayrollSchedule({ payrollPeriodId:period.id, proposed:{ ...period, financeReviewDeadline:'2026-08-26' }, reason:'', actor:{ name:'Dewi', role:'finance' }, now:new Date('2026-08-21T00:00:00Z') })
    expect(result.ok && result.status).toBe('applied')
    expect(usePayrollStore.getState().periods[0].financeReviewDeadline).toBe('2026-08-26')
  })
  it('applies period-boundary changes without an Owner approval queue', () => {
    const result = usePayrollStore.getState().adjustPayrollSchedule({ payrollPeriodId:period.id, proposed:{ ...period, periodEnd:'2026-08-21', hrSubmissionDeadline:'2026-08-25' }, reason:'', actor:{ name:'Dewi', role:'finance' }, now:new Date('2026-08-21T00:00:00Z') })
    expect(result.ok && result.status).toBe('applied')
    expect(usePayrollStore.getState().periods[0].periodEnd).toBe('2026-08-21')
    expect(usePayrollStore.getState().payrollScheduleAdjustments[0].status).toBe('applied')
  })
  it('keeps invalid date ordering as a hard validation error', () => {
    const result = usePayrollStore.getState().adjustPayrollSchedule({ payrollPeriodId:period.id, proposed:{ ...period, periodEnd:'2026-08-29' }, reason:'', actor:{ name:'Dewi', role:'finance' } })
    expect(result.ok).toBe(false)
  })
})
