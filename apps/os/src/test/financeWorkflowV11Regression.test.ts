import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Finance workflow v1.1 regressions', () => {
  it('repairs stale historical payment projections without guessing old bank accounts', () => {
    const migration = read('../../supabase/migrations/20260914200500_finance_workflow_v1_1_legacy_repair.sql')

    expect(migration).toContain("set finance_account_id = 'cash:main'")
    expect(migration).toContain("and method = 'cash'")
    expect(migration).toContain('set ledger_transaction_id = null')
    expect(migration).toContain("where e.type in ('payment_received', 'refund_completed')")
    expect(migration).toContain('perform private.sync_order_finance_transactions(v_order_id)')
    expect(migration).toContain('FINANCE_V1_1_LEDGER_REPAIR_INCOMPLETE')
    expect(migration).not.toContain("set finance_account_id = 'bank-bca'")
  })

  it('classifies walk-in sales as revenue but transfer principal and adjustments as non-operating', () => {
    const reporting = read('src/domain/cashRevenueDomain.ts')

    expect(reporting).toContain("'walk_in_sale'")
    expect(reporting).toContain('COLLECTED_REVENUE_CATEGORIES.has(transaction.category)')
    expect(reporting).toContain("'adjustment'")
    expect(reporting).toContain("'transfer'")
    expect(reporting).toContain('!NON_OPERATING_EXPENSE_SOURCES.has')
  })

  it('keeps reconciliation wording aligned with posted-cash semantics', () => {
    const permissions = read('src/config/actionPermissions.ts')
    const balance = read('src/components/finance/FinanceCashFlowOverview.tsx')

    expect(permissions).toContain('without moving cash again')
    expect(permissions).not.toContain('before an order payment enters balance and revenue')
    expect(balance).toContain('Historical transactions without a confirmed account stay here')
    expect(balance).not.toContain('Assign these legacy rows to a real account from Transactions.')
  })
})
