import { describe, expect, it } from 'vitest'
import type { FinanceTransaction } from '../store/financeStoreTypes'
import type { OrderTableRow } from '../types/orders'
import {
  getCashRevenueByBranch,
  getPaymentMethodBreakdown,
  getRevenueBySourceFromVerifiedCash,
  getTopCustomersByVerifiedCash,
} from './cashRevenueDomain'

const range = {
  startDate: new Date('2026-07-01T00:00:00+07:00'),
  endDate: new Date('2026-07-31T23:59:59+07:00'),
}

const order = (orderNumber: string, customerName: string, branch: string, source: OrderTableRow['source']): OrderTableRow => ({
  orderNumber,
  customerName,
  source,
  fulfillment: 'pickup',
  status: 'picked_up',
  totalIdr: 100_000,
  branch,
  paymentStatus: 'paid',
  createdAtLabel: '01 Jul 2026',
})

const transaction = (overrides: Partial<FinanceTransaction> & Pick<FinanceTransaction, 'id' | 'orderNumber'>): FinanceTransaction => ({
  type: 'income',
  category: 'order_payment',
  branch: 'Kedamaian',
  amount: 100_000,
  method: 'transfer',
  status: 'verified',
  description: 'Order payment',
  actor: 'Finance',
  createdAt: '2026-07-10T03:00:00.000Z',
  updatedAt: '2026-07-10T03:00:00.000Z',
  ...overrides,
})

const orders = [
  order('ORD-1', 'Alya', 'Kedamaian', 'whatsapp'),
  order('ORD-2', 'Bima', 'Pahoman', 'walk_in'),
]

const transactions: FinanceTransaction[] = [
  transaction({ id: 'pay-1', orderNumber: 'ORD-1', amount: 300_000, method: 'transfer' }),
  transaction({ id: 'refund-1', orderNumber: 'ORD-1', type: 'expense', category: 'order_refund', amount: 50_000, method: 'transfer' }),
  transaction({ id: 'pay-2', orderNumber: 'ORD-2', branch: 'Pahoman', amount: 200_000, method: 'cash' }),
  transaction({ id: 'pending', orderNumber: 'ORD-1', amount: 900_000, status: 'pending' }),
  transaction({ id: 'old', orderNumber: 'ORD-1', amount: 700_000, createdAt: '2026-06-10T03:00:00.000Z' }),
]

describe('verified-cash revenue breakdowns', () => {
  it('uses the same period and branch scope for branch totals', () => {
    expect(getCashRevenueByBranch(transactions, { range })).toEqual([
      { branch: 'Kedamaian', totalIdr: 250_000, orderCount: 1 },
      { branch: 'Pahoman', totalIdr: 200_000, orderCount: 1 },
    ])
  })

  it('ranks customers by verified net cash and subtracts linked refunds', () => {
    expect(getTopCustomersByVerifiedCash(transactions, orders, { branch: 'all', range })).toEqual([
      { customerName: 'Alya', totalIdr: 250_000, orderCount: 1 },
      { customerName: 'Bima', totalIdr: 200_000, orderCount: 1 },
    ])
  })

  it('groups only verified scoped cash by payment method and order source', () => {
    expect(getPaymentMethodBreakdown(transactions, { branch: 'Kedamaian', range })).toEqual([
      { status: 'transfer', totalIdr: 250_000, count: 2 },
    ])
    expect(getRevenueBySourceFromVerifiedCash(transactions, orders, { branch: 'all', range })).toEqual([
      { source: 'whatsapp', totalIdr: 250_000, count: 1 },
      { source: 'walk_in', totalIdr: 200_000, count: 1 },
    ])
  })
})
