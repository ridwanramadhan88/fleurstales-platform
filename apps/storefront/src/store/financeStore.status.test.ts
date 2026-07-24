import { beforeEach, describe, expect, it } from 'vitest'
import { useFinanceStore } from './financeStore'
import { useSettingsStore } from './settingsStore'
import type { FinanceTransaction } from './financeStoreTypes'

const pending: FinanceTransaction = {
  id: 'txn-pending',
  type: 'expense',
  category: 'supplies',
  branch: 'Kedamaian',
  amount: 100000,
  method: 'cash',
  status: 'pending',
  description: 'Supplies',
  actor: 'Admin',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
}

beforeEach(() => {
  useFinanceStore.setState({ transactions: [pending] })
  useSettingsStore.getState().resetSettings()
})

describe('general-ledger status writers', () => {
  it('verifies pending exactly once', () => {
    const first = useFinanceStore.getState().verifyTransaction({
      transactionId: pending.id,
      actor: { name: 'Finance', role: 'finance' },
    })
    expect(first.allowed).toBe(true)
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      status: 'verified',
      actor: 'Finance',
    })

    const updatedAt = useFinanceStore.getState().transactions[0].updatedAt
    const retry = useFinanceStore.getState().verifyTransaction({
      transactionId: pending.id,
      actor: { name: 'Other Finance', role: 'finance' },
    })
    expect(retry.allowed).toBe(false)
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      status: 'verified',
      actor: 'Finance',
      updatedAt,
    })
  })

  it('rejects pending exactly once', () => {
    expect(
      useFinanceStore.getState().rejectTransaction({
        transactionId: pending.id,
        actor: { name: 'Finance', role: 'finance' },
      }).allowed,
    ).toBe(true)
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      status: 'rejected',
      actor: 'Finance',
    })
  })

  it('does not allow verified to become rejected', () => {
    useFinanceStore.getState().verifyTransaction({
      transactionId: pending.id,
      actor: { name: 'Finance', role: 'finance' },
    })
    const result = useFinanceStore.getState().rejectTransaction({
      transactionId: pending.id,
      actor: { name: 'Finance', role: 'finance' },
    })
    expect(result.allowed).toBe(false)
    expect(useFinanceStore.getState().transactions[0].status).toBe('verified')
  })

  it('does not allow rejected to become verified', () => {
    useFinanceStore.getState().rejectTransaction({
      transactionId: pending.id,
      actor: { name: 'Finance', role: 'finance' },
    })
    const result = useFinanceStore.getState().verifyTransaction({
      transactionId: pending.id,
      actor: { name: 'Finance', role: 'finance' },
    })
    expect(result.allowed).toBe(false)
    expect(useFinanceStore.getState().transactions[0].status).toBe('rejected')
  })

  it('blocks non-Finance callers without changing timestamps or actor', () => {
    const before = useFinanceStore.getState().transactions[0]
    const result = useFinanceStore.getState().verifyTransaction({
      transactionId: pending.id,
      actor: { name: 'Owner', role: 'owner' },
    })
    expect(result.allowed).toBe(false)
    expect(useFinanceStore.getState().transactions[0]).toEqual(before)
  })

  it('blocks unknown ids', () => {
    expect(
      useFinanceStore.getState().verifyTransaction({
        transactionId: 'missing',
        actor: { name: 'Finance', role: 'finance' },
      }).allowed,
    ).toBe(false)
    expect(useFinanceStore.getState().transactions).toEqual([pending])
  })
})

describe('internal-ledger creation writer', () => {
  it('creates only pending transactions through the guarded writer', () => {
    useFinanceStore.setState({ transactions: [] })
    const result = useFinanceStore.getState().addTransaction({
      type: 'expense',
      category: 'rent',
      branch: 'Pahoman',
      amount: 1500000,
      method: 'transfer',
      name: 'Shop rent',
      description: 'Monthly shop rent',
      actor: { name: 'Finance', role: 'finance' },
    })
    expect(result.allowed).toBe(true)
    expect(useFinanceStore.getState().transactions[0]).toMatchObject({
      status: 'pending',
      category: 'rent',
      actor: 'Finance',
    })
  })



  it('enforces the create-ledger permission at the store boundary', () => {
    useFinanceStore.setState({ transactions: [] })
    useSettingsStore.getState().updateRoleActionPermission('finance', 'finance.create_ledger_entry', false)
    const result = useFinanceStore.getState().addTransaction({
      type: 'income',
      category: 'other_income',
      branch: 'All',
      amount: 1000,
      method: 'cash',
      name: 'Manual income',
      description: 'Permission test',
      actor: { name: 'Finance', role: 'finance' },
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('permission')
    expect(useFinanceStore.getState().transactions).toEqual([])
  })

  it('allows Owner creation through the same guarded writer', () => {
    useFinanceStore.setState({ transactions: [] })
    const result = useFinanceStore.getState().addTransaction({
      type: 'expense',
      category: 'other',
      branch: 'Kedamaian',
      amount: 1000,
      method: 'cash',
      name: 'Test entry',
      description: 'Test',
      actor: { name: 'Owner', role: 'owner' },
    })
    expect(result.allowed).toBe(true)
    expect(useFinanceStore.getState().transactions).toHaveLength(1)
  })
})
