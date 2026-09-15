import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Finance workspace v2.1 regressions', () => {
  it('makes every Needs Attention area navigate to its exact Finance queue', () => {
    const overview = read('src/components/finance/FinanceCashFlowOverview.tsx')
    const bridge = read('src/components/finance/financeWorkspaceNavigation.ts')
    const tabs = read('src/components/finance/FinanceWorkspaceTabs.tsx')

    expect(overview).toContain("requestFinanceWorkspaceNavigation({ module: 'order_verification'")
    expect(overview).toContain("view: 'needs_correction'")
    expect(overview).toContain("module: 'refunds', view: 'pending'")
    expect(overview).toContain("module: 'payroll', view: 'review'")
    expect(overview).toContain("module: 'payroll', view: 'ready'")
    expect(overview).toContain("module: 'ledger', view: 'legacy'")
    expect(bridge).toContain("const NAVIGATION_EVENT = 'finance-workspace-navigate'")
    expect(bridge).toContain('pendingFocus = focus')
    expect(tabs).toContain('subscribeFinanceWorkspaceNavigation((module) =>')
    expect(tabs).toContain('if (modules.includes(module)) onChange(module)')
  })

  it('gives reconciliation a first-class Needs correction filter', () => {
    const filter = read('src/components/finance/FinanceOrderFilterBar.tsx')
    const controller = read('src/components/finance/OrderVerificationQueueController.ts')

    expect(filter).toContain("'all' | 'awaiting_review' | 'needs_correction' | 'reconciled'")
    expect(filter).toContain("['needs_correction', 'Needs correction', statusCounts.needsCorrection]")
    expect(controller).toContain('reconciliationStatus: getFinanceReconciliationStatus(order)')
    expect(controller).toContain("focus.view === 'needs_correction' ? 'needs_correction' : 'all'")
  })

  it('opens a transaction detail drawer while keeping source-owned rows read only', () => {
    const ledger = read('src/components/finance/TransactionLedger.tsx')
    const detail = read('src/components/finance/FinanceTransactionDetailSheet.tsx')

    expect(ledger).toContain('<FinanceTransactionDetailSheet')
    expect(ledger).toContain('onOpenDetail={() => setSelectedTransactionId(transaction.id)}')
    expect(ledger).toContain("setAccount('legacy:unassigned')")
    expect(detail).toContain('Transaction details')
    expect(detail).toContain("editable ? 'Editable manual entry' : 'Read only'")
    expect(detail).toContain('This entry is owned by its source workflow.')
    expect(detail).toContain('Transfer group')
    expect(detail).toContain('Source event')
    expect(detail).toContain('Correction history')
    expect(detail).toContain('View evidence')
  })

  it('deep-links Payroll and Refunds without changing their money-movement commands', () => {
    const payroll = read('src/components/finance/FinancePayrollReview.tsx')
    const refunds = read('src/components/finance/FinanceRefundQueue.tsx')

    expect(payroll).toContain('setView(payrollViewFromFocus(focus.view))')
    expect(payroll).toContain('setSelectedId(focus.proposalId ?? null)')
    expect(payroll).toContain('await recordPayrollPaymentWithAccount({')
    expect(refunds).toContain("subscribeFinanceWorkspaceFocus('refunds'")
    expect(refunds).toContain("setActiveTab('pending')")
    expect(refunds).toContain('await completeOrderRefundWithAccount({')
  })
})