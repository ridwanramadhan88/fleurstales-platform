import { describe, expect, it } from 'vitest'
import type { FinanceTransaction } from '../store/financeStoreTypes'
import {
  getCashIncomeExpense,
  getCashRevenueTrend,
  isVerifiedCashExpense,
  isVerifiedCollectedIncome,
} from './cashRevenueDomain'

const transaction = (patch: Partial<FinanceTransaction>): FinanceTransaction => ({
  id: patch.id ?? Math.random().toString(),
  type: 'income',
  category: 'order_payment',
  branch: 'Kedamaian',
  amount: 100_000,
  method: 'transfer',
  status: 'verified',
  description: 'test',
  actor: 'Finance',
  createdAt: '2026-09-14T03:00:00.000Z',
  updatedAt: '2026-09-14T03:00:00.000Z',
  ...patch,
})

const range = {
  startDate: new Date('2026-09-14T00:00:00.000Z'),
  endDate: new Date('2026-09-14T23:59:59.999Z'),
}

describe('Finance v1.1 reporting classification', () => {
  it('counts verified walk-in sales as collected revenue', () => {
    const walkIn = transaction({ category: 'walk_in_sale', amount: 400_000 })

    expect(isVerifiedCollectedIncome(walkIn)).toBe(true)
    expect(getCashRevenueTrend([walkIn], { range })[0].totalIdr).toBe(400_000)
  })

  it('keeps transfer principal and balance adjustments out of operating expense', () => {
    const transferPrincipal = transaction({
      type: 'expense',
      category: 'other',
      source: 'transfer',
      amount: 1_000_000,
    })
    const adjustment = transaction({
      type: 'expense',
      category: 'other',
      source: 'adjustment',
      amount: 250_000,
    })
    const transferFee = transaction({
      type: 'expense',
      category: 'other',
      source: 'manual',
      name: 'Bank / Transfer Fee',
      amount: 6_500,
    })

    expect(isVerifiedCashExpense(transferPrincipal)).toBe(false)
    expect(isVerifiedCashExpense(adjustment)).toBe(false)
    expect(isVerifiedCashExpense(transferFee)).toBe(true)
    expect(getCashIncomeExpense([transferPrincipal, adjustment, transferFee], { range })[0].seriesB).toBe(6_500)
  })

  it('does not treat opening balance or owner deposit as revenue', () => {
    const openingBalance = transaction({
      category: 'owner_deposit',
      source: 'opening_balance',
      amount: 5_000_000,
    })
    const ownerDeposit = transaction({
      category: 'owner_deposit',
      source: 'manual',
      amount: 2_000_000,
    })

    expect(isVerifiedCollectedIncome(openingBalance)).toBe(false)
    expect(isVerifiedCollectedIncome(ownerDeposit)).toBe(false)
    expect(getCashRevenueTrend([openingBalance, ownerDeposit], { range })[0].totalIdr).toBe(0)
  })
})
