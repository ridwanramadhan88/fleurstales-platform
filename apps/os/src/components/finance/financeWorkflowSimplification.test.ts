import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('simplified Finance workflow', () => {
  it('keeps the stable Order Verification capability and one filtered ledger', () => {
    const domain = read('src/domain/financeWorkspaceDomain.ts')
    const ledger = read('src/domain/financeLedgerDomain.ts')
    const cash = read('src/components/finance/FinanceCashTab.tsx')

    expect(domain).toContain("'finance.view_order_verification'")
    expect(domain).not.toContain('collect_orders')
    expect(ledger).toContain("export type LedgerSourceFilter = 'all' | Exclude<LedgerSource, 'other'>")
    expect(cash).toContain("{ id: 'transfers', en: 'Balance & transfers', id_: 'Saldo & transfer' }")
    // The ledger only opens details; verifying lives in Tasks.
    expect(cash).toContain('onClick={() => openTransactionDetail(transaction.id)}')
    expect(cash).not.toContain('verifyTransaction')
    expect(cash).not.toContain('rejectTransaction')
  })

  it('keeps order points automatic and approved', () => {
    const store = read('src/store/hrStore.ts')
    expect(store).toContain("sourceType:'order'")
    expect(store).toContain("status:'approved'")
  })

  it('creates manual transactions as final and protects the legacy local automatic editor', () => {
    const store = read('src/store/financeStore.ts')
    expect(store).toContain('updateManualTransaction')
    expect(store).toContain("'finance.edit_ledger_entry'")
    expect(store).toContain("status:'verified'")
    expect(store).toContain('Automatic transactions can only be changed from their source workflow.')
  })
})