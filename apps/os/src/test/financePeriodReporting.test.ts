import { describe, expect, it } from 'vitest'
import { buildFinancePeriodReport } from '../domain/financePeriodReportDomain'
import type { FinanceTransaction } from '../store/financeStoreTypes'

const transaction = (input: Partial<FinanceTransaction> & Pick<FinanceTransaction, 'id' | 'type' | 'amount' | 'source' | 'transactionDate' | 'accountId'>): FinanceTransaction => ({
  category: input.type === 'income' ? 'other_income' : 'other',
  branch: 'All' as FinanceTransaction['branch'],
  method: input.accountId === 'cash:main' ? 'cash' : 'transfer',
  status: 'verified',
  description: '',
  actor: 'Finance',
  createdAt: input.transactionDate,
  updatedAt: input.transactionDate,
  ...input,
})

describe('Finance v3.2 period reporting', () => {
  it('reconciles opening balance, operating flow, adjustments, transfers, and closing balance', () => {
    const rows: FinanceTransaction[] = [
      transaction({ id:'prior', type:'income', amount:100, source:'order_payment', accountId:'bank:1', transactionDate:'2026-08-31T03:00:00Z' }),
      transaction({ id:'order', type:'income', amount:200, source:'order_payment', accountId:'bank:1', transactionDate:'2026-09-03T03:00:00Z' }),
      transaction({ id:'refund', type:'expense', amount:50, source:'order_refund', accountId:'bank:1', transactionDate:'2026-09-04T03:00:00Z' }),
      transaction({ id:'payroll', type:'expense', amount:80, source:'payroll', accountId:'cash:main', transactionDate:'2026-09-05T03:00:00Z' }),
      transaction({ id:'adjustment', type:'income', amount:20, source:'adjustment', accountId:'cash:main', transactionDate:'2026-09-06T03:00:00Z' }),
      transaction({ id:'opening', type:'income', amount:10, source:'opening_balance', accountId:'bank:1', transactionDate:'2026-09-07T03:00:00Z' }),
      transaction({ id:'transfer-out', type:'expense', amount:40, source:'transfer', accountId:'bank:1', transactionDate:'2026-09-08T03:00:00Z' }),
      transaction({ id:'transfer-in', type:'income', amount:40, source:'transfer', accountId:'cash:main', transactionDate:'2026-09-08T03:00:00Z' }),
      transaction({ id:'fee', type:'expense', amount:5, source:'manual', accountId:'bank:1', transactionDate:'2026-09-08T03:00:00Z' }),
      transaction({ id:'pending', type:'income', amount:999, source:'manual', accountId:'bank:1', transactionDate:'2026-09-09T03:00:00Z', status:'pending' }),
    ]

    const report = buildFinancePeriodReport(rows, '2026-09-01')

    expect(report.openingBalance).toBe(100)
    expect(report.operatingMoneyIn).toBe(200)
    expect(report.operatingMoneyOut).toBe(135)
    expect(report.operatingNetCashFlow).toBe(65)
    expect(report.balanceAdjustments).toBe(30)
    expect(report.internalTransferNet).toBe(0)
    expect(report.closingBalance).toBe(195)
    expect(report.transactionCount).toBe(8)

    expect(report.accounts.find((account) => account.accountId === 'bank:1')).toMatchObject({
      openingBalance: 100,
      moneyIn: 210,
      moneyOut: 95,
      closingBalance: 215,
    })
    expect(report.accounts.find((account) => account.accountId === 'cash:main')).toMatchObject({
      openingBalance: 0,
      moneyIn: 60,
      moneyOut: 80,
      closingBalance: -20,
    })

    expect(report.sources.map((source) => [source.source, source.net])).toEqual([
      ['orders', 200],
      ['refunds', -50],
      ['payroll', -80],
      ['manual', 25],
      ['transfers', 0],
    ])
  })

  it('uses Asia/Jakarta month boundaries for period membership', () => {
    const rows: FinanceTransaction[] = [
      transaction({ id:'late-august-utc', type:'income', amount:25, source:'manual', accountId:'cash:main', transactionDate:'2026-08-31T18:00:00Z' }),
    ]

    const report = buildFinancePeriodReport(rows, '2026-09-01')

    expect(report.openingBalance).toBe(0)
    expect(report.operatingMoneyIn).toBe(25)
    expect(report.closingBalance).toBe(25)
  })
})
