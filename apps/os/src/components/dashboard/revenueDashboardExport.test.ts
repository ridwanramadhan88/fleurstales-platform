import { describe, expect, it } from 'vitest'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import type { OrderTableRow } from '../../types/orders'
import {
  buildRevenueDashboardCsv,
  getEstimatedUnconfirmedOrders,
} from './revenueDashboardExport'

const order = (patch: Partial<OrderTableRow>): OrderTableRow => ({
  orderNumber: 'KDM-TEST',
  customerName: 'Customer',
  branch: 'Kedamaian',
  status: 'delivered',
  completedAt: '2026-09-03T03:00:00.000Z',
  totalIdr: 500_000,
  financeVerified: false,
  ...patch,
} as unknown as OrderTableRow)

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
  source: 'order_payment',
  entryMode: 'automatic',
  transactionDate: '2026-08-31T10:00:00.000Z',
  actor: 'Finance',
  createdAt: '2026-09-02T03:00:00.000Z',
  updatedAt: '2026-09-02T03:00:00.000Z',
  orderNumber: 'KDM-PAID',
  ...patch,
})

describe('Revenue dashboard accounting export', () => {
  it('does not call a finished order pending when Finance confirmed it in an earlier period', () => {
    const orders = [
      order({ orderNumber: 'KDM-PAID' }),
      order({ orderNumber: 'KDM-PENDING', totalIdr: 250_000 }),
    ]
    const transactions = [transaction({ orderNumber: 'KDM-PAID' })]

    const estimated = getEstimatedUnconfirmedOrders({
      orders,
      transactions,
      branch: 'all',
      range: {
        startDate: new Date('2026-09-01T00:00:00+07:00'),
        endDate: new Date('2026-09-30T23:59:59+07:00'),
      },
    })

    expect(estimated.map((item) => item.orderNumber)).toEqual(['KDM-PENDING'])
  })

  it('also trusts the order Finance flag when the historical ledger link is unavailable', () => {
    const estimated = getEstimatedUnconfirmedOrders({
      orders: [order({ orderNumber: 'KDM-VERIFIED', financeVerified: true })],
      transactions: [],
      branch: 'all',
      range: {
        startDate: new Date('2026-09-01T00:00:00+07:00'),
        endDate: new Date('2026-09-30T23:59:59+07:00'),
      },
    })

    expect(estimated).toEqual([])
  })

  it('exports the accounting date separately from record creation time', () => {
    const payment = transaction({
      orderNumber: 'KDM-PAID',
      transactionDate: '2026-08-31T10:00:00.000Z',
      createdAt: '2026-09-02T03:00:00.000Z',
    })
    const csv = buildRevenueDashboardCsv({
      scope: 'All branches',
      period: '31 Aug – 31 Aug',
      confirmedRevenueIdr: 500_000,
      estimatedRevenueIdr: 500_000,
      expenseIdr: 0,
      revenueTransactions: [payment],
      expenseTransactions: [],
      estimatedOrders: [],
    })

    const paymentLine = csv.split('\n').find((line) => line.includes('KDM-PAID'))
    expect(paymentLine).toBeDefined()
    expect(paymentLine?.startsWith('"2026-08-31T10:00:00.000Z","2026-09-02T03:00:00.000Z"')).toBe(true)
  })
})
