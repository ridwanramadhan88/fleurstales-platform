import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceStore } from '../../store/financeStore'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import { useUserStore } from '../../store/userStore'
import { useRevenueDashboardController } from './RevenueDashboardController'

const transaction = (overrides: Partial<FinanceTransaction>): FinanceTransaction => {
  const now = new Date().toISOString()
  return {
    id: `txn-${Math.random()}`,
    type: 'expense',
    category: 'utilities',
    branch: 'All',
    scope: 'company',
    amount: 100_000,
    method: 'transfer',
    status: 'verified',
    description: 'Expense',
    source: 'manual',
    entryMode: 'manual',
    transactionDate: now,
    actor: 'Finance',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('Revenue and Expense completion rules', () => {
  beforeEach(() => {
    useUserStore.setState({ role: 'owner', name: 'Budi' })
    useFinanceStore.setState({
      customCategories: [],
      categoryOverrides: [],
      transactions: [
        transaction({ id: 'company-expense', amount: 100_000, branch: 'All', scope: 'company' }),
        transaction({ id: 'pahoman-expense', amount: 50_000, branch: 'Pahoman', scope: 'branch' }),
        transaction({ id: 'kedamaian-expense', amount: 70_000, branch: 'Kedamaian', scope: 'branch' }),
      ],
    })
  })

  it('keeps company-wide expenses separate even while a branch is selected', () => {
    const { result } = renderHook(() => useRevenueDashboardController({ activeBranch: 'Pahoman' }))
    expect(result.current.companyWideExpenseIdr).toBe(100_000)

    act(() => result.current.onTrendMetricChange('expense'))
    expect(result.current.periodComparison?.currentItemCount).toBe(1)

    act(() => result.current.onCompareModeChange('branch_vs_branch'))
    expect(result.current.compareBranchNames).toEqual({ branchA: 'Pahoman', branchB: 'Kedamaian' })
    expect(result.current.compareTotals.seriesA).toBe(50_000)
    expect(result.current.compareTotals.seriesB).toBe(70_000)
    expect(result.current.companyWideExpenseIdr).toBe(100_000)
  })

  it('counts expense transactions rather than reporting zero orders', () => {
    const { result } = renderHook(() => useRevenueDashboardController({ activeBranch: 'All' }))
    act(() => result.current.onTrendMetricChange('expense'))
    expect(result.current.periodComparison?.currentItemCount).toBe(3)
  })
})
