import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('simplified Finance workflow', () => {
  it('uses Order Verification identifiers and defaults to every unresolved order', () => {
    const domain = read('src/domain/financeWorkspaceDomain.ts')
    const controller = read('src/components/finance/OrderVerificationQueueController.ts')
    const scopes = read('src/components/finance/FinanceDateScopeTabs.tsx')

    expect(domain).toContain("'order_verification'")
    expect(domain).toContain("'finance.view_order_verification'")
    expect(domain).not.toContain('collect_orders')
    expect(controller).toContain("useState<FinanceDateScopeId>('all')")
    expect(controller).toContain("if (scope === 'all') return true")
    expect(scopes).toContain("export type FinanceDateScopeId = 'all'")
  })

  it('keeps the transaction ledger read-only except for manual editing', () => {
    const ledger = read('src/components/finance/TransactionLedger.tsx')
    const controller = read('src/components/finance/TransactionLedgerController.ts')

    expect(ledger).toContain("['orders', 'Orders']")
    expect(ledger).toContain("['payroll', 'Payroll']")
    expect(ledger).toContain("['refunds', 'Refunds']")
    expect(ledger).toContain("['manual', 'Manual']")
    expect(ledger).toContain('finance-edit-manual-transaction')
    expect(ledger).not.toContain('onVerify')
    expect(ledger).not.toContain('onStartReject')
    expect(controller).not.toContain('verifyTransaction')
    expect(controller).not.toContain('rejectTransaction')
  })

  it('keeps order points automatic and approved', () => {
    const store = read('src/store/hrStore.ts')
    expect(store).toContain("sourceType:'order'")
    expect(store).toContain("status:'approved'")
  })

  it('creates manual transactions as final and protects automatic editing', () => {
    const store = read('src/store/financeStore.ts')
    expect(store).toContain('updateManualTransaction')
    expect(store).toContain("'finance.edit_ledger_entry'")
    expect(store).toContain("status:'verified'")
    expect(store).toContain('Automatic transactions can only be changed from their source workflow.')
  })
})
