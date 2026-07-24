import { describe, expect, it } from 'vitest'
import { canMakeFinanceTransactionDecision } from './financeTransactionStatusDomain'
import type { FinanceTransaction } from '../store/financeStoreTypes'
import type { UserRole } from '../store/userStore'

const makeTransaction = (
  status: FinanceTransaction['status'] = 'pending',
): FinanceTransaction => ({
  id: 'txn-1',
  type: 'expense',
  category: 'supplies',
  branch: 'Kedamaian',
  amount: 100000,
  method: 'cash',
  status,
  description: 'Supplies',
  actor: 'Admin',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
})

describe('canMakeFinanceTransactionDecision', () => {
  it.each(['verify', 'reject'] as const)(
    'allows Finance to %s a pending transaction',
    (decision) => {
      expect(
        canMakeFinanceTransactionDecision({
          transaction: makeTransaction(),
          role: 'finance',
          decision,
        }),
      ).toEqual({ allowed: true })
    },
  )

  it.each(['owner', 'admin', 'hr', 'florist'] as UserRole[])(
    'blocks %s from changing general-ledger status',
    (role) => {
      expect(
        canMakeFinanceTransactionDecision({
          transaction: makeTransaction(),
          role,
          decision: 'verify',
        }).allowed,
      ).toBe(false)
    },
  )

  it.each(['verified', 'rejected'] as const)(
    'keeps %s terminal',
    (status) => {
      expect(
        canMakeFinanceTransactionDecision({
          transaction: makeTransaction(status),
          role: 'finance',
          decision: 'verify',
        }).allowed,
      ).toBe(false)
      expect(
        canMakeFinanceTransactionDecision({
          transaction: makeTransaction(status),
          role: 'finance',
          decision: 'reject',
        }).allowed,
      ).toBe(false)
    },
  )

  it('blocks missing transactions', () => {
    expect(
      canMakeFinanceTransactionDecision({
        transaction: undefined,
        role: 'finance',
        decision: 'verify',
      }).allowed,
    ).toBe(false)
  })
})
