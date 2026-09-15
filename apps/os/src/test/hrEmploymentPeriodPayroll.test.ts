import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { doesEmploymentOverlapPeriod, isPartialPeriodEmployment } from '../domain/hrEmployeeLifecycleDomain'
import type { Employee } from '../store/hrStoreTypes'

const employee = (overrides: Partial<Employee> = {}): Employee => ({
  id: 'emp-test',
  name: 'Test Employee',
  position: 'Florist',
  branch: '',
  systemRole: 'florist',
  status: 'active',
  phone: '',
  hireDate: '2026-01-01',
  baseSalaryIdr: 4_000_000,
  ...overrides,
})

describe('HR employment-period payroll eligibility', () => {
  it('includes an active employee employed before the period ends', () => {
    expect(doesEmploymentOverlapPeriod(employee(), '2026-09-01', '2026-09-30')).toBe(true)
  })

  it('keeps a separated employee in the payroll period containing their final day', () => {
    expect(doesEmploymentOverlapPeriod(employee({
      status: 'inactive',
      employmentEndDate: '2026-09-20',
    }), '2026-09-01', '2026-09-30')).toBe(true)
  })

  it('excludes an employee whose employment ended before the payroll period', () => {
    expect(doesEmploymentOverlapPeriod(employee({
      status: 'inactive',
      employmentEndDate: '2026-08-31',
    }), '2026-09-01', '2026-09-30')).toBe(false)
  })

  it('excludes an employee hired after the payroll period', () => {
    expect(doesEmploymentOverlapPeriod(employee({ hireDate: '2026-10-01' }), '2026-09-01', '2026-09-30')).toBe(false)
  })

  it('does not invent a separation date for legacy inactive employees', () => {
    expect(doesEmploymentOverlapPeriod(employee({ status: 'inactive' }), '2026-09-01', '2026-09-30')).toBe(false)
  })

  it('flags joins and separations inside a period as partial-period employment', () => {
    expect(isPartialPeriodEmployment(employee({ hireDate: '2026-09-10' }), '2026-09-01', '2026-09-30')).toBe(true)
    expect(isPartialPeriodEmployment(employee({ employmentEndDate: '2026-09-20' }), '2026-09-01', '2026-09-30')).toBe(true)
    expect(isPartialPeriodEmployment(employee(), '2026-09-01', '2026-09-30')).toBe(false)
  })

  it('wires the overlap rule into generation and surfaces partial-period review', () => {
    const store = readFileSync('src/store/payrollStore.ts', 'utf8')
    expect(store).toContain('doesEmploymentOverlapPeriod(employee, period.periodStart, period.periodEnd)')
    expect(store).not.toContain("employee.status === 'active' && employee.hireDate <= period.periodEnd")
    expect(store).toContain('Partial-period employment:')
    expect(store).toContain('Verify salary treatment before Finance review.')
    expect(store).not.toContain('proratedBaseSalaryIdr')
  })

  it('records separation metadata before the status transition is persisted', () => {
    const lifecycle = readFileSync('src/data/staffLifecycleSupabase.ts', 'utf8')
    expect(lifecycle).toContain('employmentEndDate: item.employmentEndDate ?? todayIsoDate()')
    expect(lifecycle).toContain("separationReason: item.separationReason ?? 'Employee deactivated'")
    expect(lifecycle).toContain('separatedBy: item.separatedBy ?? separatedBy')
  })

  it('keeps a server-side coverage guard on payroll generation', () => {
    const migration = readFileSync('../../supabase/migrations/20260916090000_hr_employment_period_payroll.sql', 'utf8')
    expect(migration).toContain('PAYROLL_EMPLOYMENT_COVERAGE_MISMATCH')
    expect(migration).toContain('private.assert_payroll_employment_coverage')
    expect(migration).toContain("private.apply_payroll_workflow_state('generate', p_expected_revision, p_snapshot)")
    expect(migration).toContain('grant execute on function public.payroll_generate(bigint,jsonb) to authenticated')
  })
})