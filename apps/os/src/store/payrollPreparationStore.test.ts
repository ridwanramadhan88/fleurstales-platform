import { beforeEach, describe, expect, it } from 'vitest'
import { usePayrollStore } from './payrollStore'
import { useHrStore } from './hrStore'

const owner = { name:'Budi', role:'owner' as const }
const hr = { name:'Star', role:'hr' as const }

const initialCompensations = usePayrollStore.getState().compensations

beforeEach(() => {
  usePayrollStore.setState({ periods:[], employeePayrolls:[], compensations:initialCompensations })
  useHrStore.setState({ employeePointEntries:[] })
})

describe('payroll preparation store', () => {
  it('versions base salary and allows only Owner to change it', () => {
    expect(usePayrollStore.getState().setEmployeeCompensation({ employeeId:'emp-vero', baseSalaryIdr:5_000_000, effectiveFrom:'2026-08-01', actor:hr }).ok).toBe(false)
    const result = usePayrollStore.getState().setEmployeeCompensation({ employeeId:'emp-vero', baseSalaryIdr:5_000_000, effectiveFrom:'2026-08-01', actor:owner })
    expect(result.ok).toBe(true)
    const records = usePayrollStore.getState().compensations.filter((item) => item.employeeId === 'emp-vero')
    expect(records.some((item) => item.baseSalaryIdr === 5_000_000)).toBe(true)
    expect(records.some((item) => item.effectiveTo === '2026-07-31')).toBe(true)
  })

  it('generates employee drafts from effective salary and approved points', () => {
    const period = usePayrollStore.getState().ensureCurrentPeriod(new Date('2026-08-23T00:00:00Z'))
    useHrStore.setState({ employeePointEntries:[{
      id:'point-1', employeeId:'emp-vero', category:'manual_reward', points:20, sourceType:'order', sourceId:'order:1', reason:'Completed orders', status:'approved', createdBy:'HR', createdAt:'2026-08-10T00:00:00.000Z',
    }] })
    const result = usePayrollStore.getState().generateEmployeePayrollDrafts({ payrollPeriodId:period.id, actor:hr })
    expect(result.ok).toBe(true)
    const draft = usePayrollStore.getState().employeePayrolls.find((item) => item.employeeId === 'emp-vero')!
    expect(draft.baseSalaryIdr).toBe(4_000_000)
    expect(draft.netPoints).toBe(20)
    expect(draft.bonusIdr).toBe(20_000)
    expect(draft.finalPayrollIdr).toBe(4_020_000)
    expect(draft.pointEntries).toHaveLength(1)
  })

  it('allows submission with pending points as a warning and freezes drafts', () => {
    const period = usePayrollStore.getState().ensureCurrentPeriod(new Date('2026-08-23T00:00:00Z'))
    useHrStore.setState({ employeePointEntries:[{
      id:'point-pending', employeeId:'emp-vero', category:'manual_reward', points:10, sourceType:'manual', sourceId:'manual:1', reason:'Reward', status:'pending', createdBy:'HR', createdAt:'2026-08-10T00:00:00.000Z',
    }] })
    usePayrollStore.getState().generateEmployeePayrollDrafts({ payrollPeriodId:period.id, actor:hr })
    expect(usePayrollStore.getState().submitPayrollToFinance({ payrollPeriodId:period.id, actor:hr }).ok).toBe(true)
    expect(usePayrollStore.getState().employeePayrolls.every((draft) => draft.status === 'pending_finance_review')).toBe(true)
    expect(usePayrollStore.getState().payrollProposals[0]?.warnings).toContain('Point entries remain pending review.')
  })
})
