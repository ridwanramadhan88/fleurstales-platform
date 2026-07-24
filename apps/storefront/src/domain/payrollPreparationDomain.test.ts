import { describe, expect, it } from 'vitest'
import { calculateEmployeePayroll, isCompensationEffectiveForDate, isPointEntryInsidePayrollPeriod } from './payrollPreparationDomain'

describe('payroll preparation domain', () => {
  it('adds approved point bonus without reducing base salary below its value', () => {
    expect(calculateEmployeePayroll(4_000_000, [
      { points: 40, status: 'approved' },
      { points: -10, status: 'approved' },
      { points: 100, status: 'pending' },
    ])).toEqual({ positivePoints: 40, negativePoints: -10, netPoints: 30, bonusIdr: 30_000, finalPayrollIdr: 4_030_000 })
    expect(calculateEmployeePayroll(4_000_000, [{ points: -50, status: 'approved' }]).finalPayrollIdr).toBe(4_000_000)
  })

  it('uses immutable entry dates to resolve the earning period', () => {
    expect(isPointEntryInsidePayrollPeriod({ createdAt: '2026-07-21T00:00:00.000Z' }, '2026-07-21', '2026-08-20')).toBe(true)
    expect(isPointEntryInsidePayrollPeriod({ createdAt: '2026-08-21T00:00:00.000Z' }, '2026-07-21', '2026-08-20')).toBe(false)
  })

  it('selects the compensation version effective at the period end', () => {
    expect(isCompensationEffectiveForDate({ effectiveFrom: '2026-01-01' }, '2026-08-20')).toBe(true)
    expect(isCompensationEffectiveForDate({ effectiveFrom: '2026-01-01', effectiveTo: '2026-07-31' }, '2026-08-20')).toBe(false)
  })
})

it('uses the owner-configured point conversion and caps monthly bonus at Rp500.000', () => {
  expect(calculateEmployeePayroll(4_000_000, [{ points: 10, status: 'approved' }], 1_500).bonusIdr).toBe(15_000)
  expect(calculateEmployeePayroll(4_000_000, [{ points: 1_000, status: 'approved' }], 1_500).bonusIdr).toBe(500_000)
})
