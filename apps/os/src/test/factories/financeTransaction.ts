/**
 * @file financeTransaction.ts
 * @description Test factory for Finance ledger rows.
 */
import type { FinanceTransaction } from '../../store/financeStoreTypes'

let sequence = 0

export const makeFinanceTransaction = (overrides: Partial<FinanceTransaction> = {}): FinanceTransaction => {
  sequence += 1
  return {
    id: `txn-${sequence}`,
    type: 'income',
    category: 'order_payment' as FinanceTransaction['category'],
    branch: 'Kedamaian',
    scope: 'branch',
    accountId: 'cash:main',
    amount: 100_000,
    method: 'cash',
    status: 'verified',
    description: 'Test transaction',
    source: 'manual',
    entryMode: 'manual',
    transactionDate: '2026-11-10T12:00:00+07:00',
    actor: 'Finance',
    createdAt: '2026-11-10T05:00:00.000Z',
    updatedAt: '2026-11-10T05:00:00.000Z',
    ...overrides,
  }
}
