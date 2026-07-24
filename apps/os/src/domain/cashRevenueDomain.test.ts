import { describe, expect, it, vi, afterEach } from 'vitest'
import type { FinanceTransaction } from '../store/financeStoreTypes'
import { getCashIncomeExpense, getCashRevenueByBranch, getCashRevenueSummary, getCashRevenueTrend } from './cashRevenueDomain'

const transaction = (patch: Partial<FinanceTransaction>): FinanceTransaction => ({
  id: patch.id ?? Math.random().toString(),
  type: 'income',
  category: 'order_payment',
  branch: 'Kedamaian',
  amount: 100_000,
  method: 'cash',
  status: 'verified',
  description: 'test',
  actor: 'Finance',
  createdAt: '2026-07-12T03:00:00.000Z',
  updatedAt: '2026-07-12T03:00:00.000Z',
  ...patch,
})

afterEach(() => vi.useRealTimers())

describe('cash revenue reporting', () => {
  it('includes only verified collected income and subtracts verified refunds', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-12T10:00:00.000Z'))
    const transactions = [
      transaction({ amount: 500_000, orderNumber: 'KDM-1' }),
      transaction({ status: 'pending', amount: 900_000, orderNumber: 'KDM-2' }),
      transaction({ type: 'expense', category: 'order_refund', amount: 125_000 }),
      transaction({ type: 'expense', category: 'order_refund', status: 'pending', amount: 75_000 }),
    ]
    expect(getCashRevenueSummary(transactions, { windowDays: 7 }).totalRevenueIdr).toBe(375_000)
  })

  it('scopes cash revenue by branch', () => {
    const transactions = [
      transaction({ branch: 'Kedamaian', amount: 200_000 }),
      transaction({ branch: 'Pahoman', amount: 700_000 }),
    ]
    const range = { startDate: new Date('2026-07-12'), endDate: new Date('2026-07-12') }
    expect(getCashRevenueTrend(transactions, { branch: 'Kedamaian', range })[0].totalIdr).toBe(200_000)
  })

  it('keeps order refunds out of operating expense while reducing revenue', () => {
    const transactions = [
      transaction({ amount: 500_000 }),
      transaction({ type: 'expense', category: 'order_refund', amount: 100_000 }),
      transaction({ type: 'expense', category: 'supplies', amount: 50_000 }),
    ]
    const range = { startDate: new Date('2026-07-12'), endDate: new Date('2026-07-12') }
    expect(getCashIncomeExpense(transactions, { range })[0]).toMatchObject({ seriesA: 400_000, seriesB: 50_000 })
  })

  it('reports net cash revenue by branch', () => {
    const transactions = [
      transaction({ branch: 'Kedamaian', amount: 500_000, orderNumber: 'KDM-1' }),
      transaction({ branch: 'Kedamaian', type: 'expense', category: 'order_refund', amount: 100_000 }),
    ]
    expect(getCashRevenueByBranch(transactions)).toEqual([
      { branch: 'Kedamaian', totalIdr: 400_000, orderCount: 1 },
    ])
  })
})
