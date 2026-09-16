import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { getHrSummary } from '../domain/hrDomain'
import { useFinanceStore } from '../store/financeStore'
import type { Employee } from '../store/hrStoreTypes'

const read = (path: string) => readFileSync(path, 'utf8')
const initialFinanceTransactions = useFinanceStore.getState().transactions

afterEach(() => {
  useFinanceStore.setState({ transactions: initialFinanceTransactions })
})

const employee = (id: string): Employee => ({
  id,
  name: id,
  position: 'Florist',
  branch: 'Kedamaian',
  systemRole: 'florist',
  status: 'active',
  phone: '',
  hireDate: '2026-01-01',
})

describe('HR consistency and warning cleanup', () => {
  it('counts missing attendance only for staff expected to work today', () => {
    const employees = [employee('scheduled'), employee('off-day')]
    const summary = getHrSummary(
      employees,
      [{ id:'a-1', employeeId:'scheduled', date:'2026-09-16', status:'present', actor:'Test', createdAt:'2026-09-16T01:00:00.000Z' }],
      '2026-09-16',
      new Set(['scheduled']),
    )
    expect(summary.presentToday).toBe(1)
    expect(summary.notMarkedToday).toBe(0)

    const withSecondScheduled = getHrSummary(employees, [], '2026-09-16', new Set(['scheduled', 'off-day']))
    expect(withSecondScheduled.notMarkedToday).toBe(2)
  })

  it('keeps payroll readiness aligned with employment-period eligibility and Jakarta dates', () => {
    const payroll = read('src/components/hr/HrPayrollSection.tsx')
    expect(payroll).toContain('doesEmploymentOverlapPeriod(employee, period.periodStart, period.periodEnd)')
    expect(payroll).not.toContain("employee.status === 'active' && employee.systemRole !== 'owner' && employee.hireDate <= period.periodEnd")
    expect(payroll).toContain('todayIsoDate()')
    expect(payroll).not.toContain("new Date().toISOString().slice(0, 7)")
    expect(payroll).toContain('Employment dates')
    expect(payroll).toContain('review item')
    expect(payroll).not.toContain('These warnings do not block submission.')
    expect(payroll).not.toContain('with ${warnings.length} warning')
  })

  it('keeps attendance exception severity in the review queue instead of duplicating it on staff cards', () => {
    const people = read('src/components/hr/HrTabContent.tsx')
    const queue = read('src/components/hr/AttendanceReviewQueue.tsx')
    expect(people).toContain('Scheduled · no record')
    expect(people).toContain('Needs review · {reviewCases.length}')
    expect(people).not.toContain('Missing checkout</span>')
    expect(people).toContain("timeZone:'Asia/Jakarta'")
    expect(queue).toContain('Attendance review')
    expect(queue).toContain('Resolved')
    expect(queue).toContain("needsReview ? 'bg-warning/10 text-warning' : 'bg-surface-neutral")
  })

  it('shows separation metadata as employment history rather than setup warnings', () => {
    const people = read('src/components/hr/HrTabContent.tsx')
    expect(people).toContain('Employment history')
    expect(people).toContain('Employment ended')
    expect(people).toContain('Separated by:')
    expect(people).toContain("readiness.state === 'active' && readiness.missing.length > 0")
    expect(people).toContain('final employment day')
    expect(people).toContain('payroll periods that overlap the final day remain eligible')
  })

  it('blocks the legacy local payroll expense path without a paid-from account', () => {
    useFinanceStore.setState({ transactions: [] })
    const blocked = useFinanceStore.getState().recordPayrollExpense({
      payrollProposalId:'proposal-1',
      payrollPeriodId:'period-1',
      periodLabel:'2026-09-01 - 2026-09-30',
      amount:4_000_000,
      paymentDate:'2026-10-01',
      paymentMethod:'Bank transfer',
      paymentReference:'PAY-1',
      idempotencyKey:'payroll-expense:proposal-1',
      actor:'Finance',
    })
    expect(blocked).toMatchObject({ allowed:false, reason:'Payroll payment requires a paid-from account.' })
    expect(useFinanceStore.getState().transactions).toHaveLength(0)

    const allowed = useFinanceStore.getState().recordPayrollExpense({
      payrollProposalId:'proposal-1',
      payrollPeriodId:'period-1',
      periodLabel:'2026-09-01 - 2026-09-30',
      amount:4_000_000,
      paymentDate:'2026-10-01',
      paymentMethod:'Bank transfer',
      paymentReference:'PAY-1',
      accountId:'account-bank',
      idempotencyKey:'payroll-expense:proposal-1',
      actor:'Finance',
    })
    expect(allowed.allowed).toBe(true)
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({ source:'payroll', accountId:'account-bank' })
  })
})
