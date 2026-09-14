import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('Finance workspace v2.2 regressions', () => {
  it('moves category configuration out of daily Transactions without removing Finance access', () => {
    const transactions = read('src/components/finance/AddInternalTransaction.tsx')
    const overview = read('src/components/finance/FinanceCashFlowOverview.tsx')
    const financeSettings = read('src/components/settings/FinanceCategorySettingsPanel.tsx')
    const paymentSettings = read('src/components/settings/PaymentMethodSettings.tsx')
    const settingsController = read('src/components/settings/SettingsCenterController.ts')

    expect(transactions).not.toContain('Manage categories')
    expect(transactions).not.toContain('title="Expense categories"')
    expect(transactions).toContain('Settings → Finance')
    expect(overview).toContain('Finance settings')
    expect(overview).toContain('<FinanceCategorySettingsPanel />')
    expect(financeSettings).toContain('Transaction categories')
    expect(financeSettings).toContain('addExpenseCategory')
    expect(financeSettings).toContain('updateBuiltInCategory')
    expect(paymentSettings).toContain('<FinanceCategorySettingsPanel />')
    expect(settingsController).toContain("{ id: 'payment-methods', label: 'Finance', available: true }")
  })

  it('shows Reconciliation open-work counts without changing stable internal routes', () => {
    const tabs = read('src/components/finance/FinanceWorkspaceTabs.tsx')

    expect(tabs).toContain("orders.filter((order) => postedOrderNumbers.has(order.orderNumber) && !order.financeVerified).length")
    expect(tabs).toContain("orders.filter((order) => order.paymentStatus === 'refund_pending').length")
    expect(tabs).toContain('{counts.orders}')
    expect(tabs).toContain('{counts.refunds}')
    expect(tabs).toContain("activeModule === 'order_verification'")
    expect(tabs).toContain("activeModule === 'refunds'")
    expect(tabs).toContain("label: 'Order Reconciliation'")
    expect(tabs).not.toContain('rounded-full')
  })

  it('links ledger details back to Orders and exact Payroll history while keeping source-owned rows read only', () => {
    const ledger = read('src/components/finance/TransactionLedger.tsx')
    const detail = read('src/components/finance/FinanceTransactionDetailSheet.tsx')
    const payroll = read('src/components/finance/FinancePayrollReview.tsx')
    const bridge = read('src/components/finance/financeWorkspaceNavigation.ts')

    expect(detail).toContain('Open order')
    expect(detail).toContain('Open payroll')
    expect(detail).toContain("editable ? 'Editable manual entry' : 'Read only'")
    expect(detail).toContain('This entry is owned by its source workflow.')
    expect(ledger).toContain('requestFinanceWorkspaceNavigation({')
    expect(ledger).toContain("module: 'payroll', view: 'history', proposalId")
    expect(bridge).toContain("view: 'review' | 'ready' | 'history'; proposalId?: string")
    expect(payroll).toContain('setSelectedId(focus.proposalId ?? null)')
    expect(payroll).toContain("view === 'history' ? 'history'")
  })

  it('keeps the final workspace empty states and ledger status wording operational', () => {
    const ledger = read('src/components/finance/TransactionLedger.tsx')
    const payroll = read('src/components/finance/FinancePayrollReview.tsx')

    expect(ledger).toContain("if (transaction.status === 'pending') return 'Pending'")
    expect(ledger).toContain("if (transaction.status === 'rejected') return 'Needs correction'")
    expect(ledger).toContain('Adjust the source, account, branch, date, category, or search filters')
    expect(payroll).toContain('HR-submitted proposals that need Finance review will appear here.')
    expect(payroll).toContain('Approved proposals waiting for final payment will appear here.')
    expect(payroll).toContain('Paid and resolved payroll proposals will appear here.')
  })
})
