import { describe, expect, it } from 'vitest'
import { makeFinanceTransaction as tx } from '../test/factories/financeTransaction'
import {
  DEFAULT_LEDGER_FILTERS,
  accountBalances,
  filterLedger,
  ledgerSourceOf,
  monthCashFlow,
} from './financeLedgerDomain'

const text = (transaction: { name?: string; description: string }) => transaction.name ?? transaction.description

describe('finance ledger', () => {
  it('hides order payments still waiting for reconciliation but keeps voided rows', () => {
    const rows = [
      tx({ id: 'pending-order', source: 'order_payment', status: 'pending', entryMode: 'automatic' }),
      tx({ id: 'posted-order', source: 'order_payment', status: 'verified', entryMode: 'automatic' }),
      tx({ id: 'voided', status: 'void' }),
    ]
    const visible = filterLedger(rows, { ...DEFAULT_LEDGER_FILTERS, month: null }, text).map((row) => row.id)
    expect(visible).toEqual(expect.arrayContaining(['posted-order', 'voided']))
    expect(visible).not.toContain('pending-order')
  })

  it('filters by month, source, account, branch, and search', () => {
    const rows = [
      tx({ id: 'nov-cash', name: 'Electricity', transactionDate: '2026-11-03T12:00:00+07:00' }),
      tx({ id: 'oct-cash', transactionDate: '2026-10-28T12:00:00+07:00' }),
      tx({ id: 'nov-bank', accountId: 'bca', branch: 'Pahoman', transactionDate: '2026-11-05T12:00:00+07:00' }),
      tx({ id: 'nov-payroll', source: 'payroll', entryMode: 'automatic', scope: 'company', branch: 'All', transactionDate: '2026-11-25T12:00:00+07:00' }),
    ]
    const ids = (patch: Partial<Parameters<typeof filterLedger>[1]>) =>
      filterLedger(rows, { ...DEFAULT_LEDGER_FILTERS, month: '2026-11', ...patch }, text).map((row) => row.id)

    expect(ids({})).toEqual(['nov-payroll', 'nov-bank', 'nov-cash'])
    expect(ids({ source: 'payroll' })).toEqual(['nov-payroll'])
    expect(ids({ accountId: 'bca' })).toEqual(['nov-bank'])
    expect(ids({ branch: 'Company-wide' })).toEqual(['nov-payroll'])
    expect(ids({ branch: 'Pahoman' })).toEqual(['nov-bank'])
    expect(ids({ query: 'electric' })).toEqual(['nov-cash'])
  })

  it('treats opening balances, adjustments, and transfers as balance moves', () => {
    expect(ledgerSourceOf(tx({ source: 'transfer' }))).toBe('transfers')
    expect(ledgerSourceOf(tx({ source: 'opening_balance' }))).toBe('transfers')
    expect(ledgerSourceOf(tx({ source: 'order_refund' }))).toBe('refunds')

    const rows = [
      tx({ type: 'income', amount: 500_000 }),
      tx({ type: 'expense', amount: 200_000 }),
      tx({ type: 'income', amount: 1_000_000, source: 'opening_balance' }),
      tx({ type: 'expense', amount: 50_000, status: 'void' }),
      tx({ type: 'income', amount: 70_000, transactionDate: '2026-10-01T12:00:00+07:00' }),
    ]
    expect(monthCashFlow(rows, '2026-11')).toEqual({ moneyIn: 500_000, moneyOut: 200_000, net: 300_000 })
    expect(accountBalances(rows).get('cash:main')).toBe(500_000 - 200_000 + 1_000_000 + 70_000)
  })

  it('puts rows without an account in the legacy bucket', () => {
    const balances = accountBalances([tx({ accountId: undefined, amount: 40_000 })])
    expect(balances.get('legacy:unassigned')).toBe(40_000)
  })
})
