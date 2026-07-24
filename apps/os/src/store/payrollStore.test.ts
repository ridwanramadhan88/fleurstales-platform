import { beforeEach, describe, expect, it } from 'vitest'
import { usePayrollStore } from './payrollStore'

describe('payroll period generation', () => {
  beforeEach(() => usePayrollStore.setState({ periods: [] }))
  it('generates the same monthly period only once', () => {
    const first = usePayrollStore.getState().ensureCurrentPeriod(new Date('2026-08-22T05:00:00Z'))
    const second = usePayrollStore.getState().ensureCurrentPeriod(new Date('2026-08-23T05:00:00Z'))
    expect(first.id).toBe('payroll-2026-08')
    expect(second.id).toBe(first.id)
    expect(usePayrollStore.getState().periods).toHaveLength(1)
  })
})
