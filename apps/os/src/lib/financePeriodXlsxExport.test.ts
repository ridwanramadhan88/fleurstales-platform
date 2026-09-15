import { describe, expect, it } from 'vitest'
import { buildFinancePeriodReport } from '../domain/financePeriodReportDomain'
import type { FinanceTransaction } from '../store/financeStoreTypes'
import { buildFinancePeriodXlsx } from './financePeriodXlsxExport'

const transaction = (patch: Partial<FinanceTransaction>): FinanceTransaction => ({
  id: 'txn-test',
  type: 'income',
  category: 'order_payment',
  branch: 'Kedamaian',
  scope: 'branch',
  accountId: 'cash:main',
  amount: 500_000,
  method: 'cash',
  status: 'verified',
  description: 'Order payment',
  orderNumber: 'KDM-1',
  transactionCode: 'FIN-001',
  source: 'order_payment',
  entryMode: 'automatic',
  transactionDate: '2026-09-03T04:00:00.000Z',
  actor: 'Finance',
  createdAt: '2026-09-04T02:00:00.000Z',
  updatedAt: '2026-09-04T02:00:00.000Z',
  ...patch,
})

describe('Finance period XLSX export', () => {
  it('creates a real XLSX ZIP with the accounting report sheets and business dates', () => {
    const transactions = [
      transaction({}),
      transaction({
        id: 'txn-expense',
        type: 'expense',
        category: 'supplies',
        source: 'manual',
        amount: 125_000,
        transactionDate: '2026-09-05T06:00:00.000Z',
        createdAt: '2026-09-06T02:00:00.000Z',
        transactionCode: 'FIN-002',
        orderNumber: undefined,
      }),
      transaction({
        id: 'txn-october',
        transactionDate: '2026-10-01T04:00:00.000Z',
        createdAt: '2026-10-01T04:00:00.000Z',
        transactionCode: 'FIN-OCT',
      }),
    ]
    const report = buildFinancePeriodReport(transactions, '2026-09')
    const workbook = buildFinancePeriodXlsx({
      report,
      transactions,
      accountLabels: { 'cash:main': 'Cash' },
      periodStatus: 'closed',
    })

    expect(Array.from(workbook.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    const plain = new TextDecoder().decode(workbook)
    expect(plain).toContain('Summary')
    expect(plain).toContain('Transactions')
    expect(plain).toContain('By Account')
    expect(plain).toContain('By Source')
    expect(plain).toContain('Accounting Date')
    expect(plain).toContain('2026-09-03T04:00:00.000Z')
    expect(plain).toContain('2026-09-04T02:00:00.000Z')
    expect(plain).not.toContain('FIN-OCT')
  })
})
