import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

// Keep this suite as the integration contract for the Finance v2 workspace shell.
describe('Finance workspace v2 regressions', () => {
  it('presents four top-level Finance workspaces and nests refunds under Reconciliation', () => {
    const tabs = read('src/components/finance/FinanceWorkspaceTabs.tsx')

    expect(tabs).toContain("type FinanceWorkspaceGroup = 'overview' | 'reconciliation' | 'transactions' | 'payroll'")
    expect(tabs).toContain("const GROUP_ORDER: FinanceWorkspaceGroup[] = ['overview', 'reconciliation', 'transactions', 'payroll']")
    expect(tabs).toContain("label: 'Overview'")
    expect(tabs).toContain("label: 'Reconciliation'")
    expect(tabs).toContain("label: 'Transactions'")
    expect(tabs).toContain("label: 'Payroll'")
    expect(tabs).toContain('Orders')
    expect(tabs).toContain('Refunds')
    expect(tabs).toContain("module === 'order_verification' || module === 'refunds'")
  })

  it('makes Overview the default without changing the stable internal Finance routes', () => {
    const domain = read('src/domain/financeWorkspaceDomain.ts')

    expect(domain).toContain("const MODULE_ORDER: FinanceWorkspaceModule[] = ['balance','order_verification','refunds','ledger','payroll']")
    expect(domain).toContain("?? 'balance'")
    expect(domain).toContain("| 'order_verification'")
    expect(domain).toContain("| 'refunds'")
  })

  it('surfaces actionable Finance workload on Overview', () => {
    const overview = read('src/components/finance/FinanceCashFlowOverview.tsx')

    expect(overview).toContain('Needs Attention')
    expect(overview).toContain("order.financeVerificationStatus === 'rejected'")
    expect(overview).toContain("order.paymentStatus === 'refund_pending'")
    expect(overview).toContain("proposal.status === 'finance_approved'")
    expect(overview).toContain('Legacy / unassigned ledger rows')
  })

  it('keeps reconciliation review-only with respect to already-posted cash', () => {
    const queue = read('src/components/finance/OrderVerificationQueue.tsx')

    expect(queue).toContain('Admin-confirmed payments are already posted to their receiving account.')
    expect(queue).toContain('it never posts the money a second time.')
    expect(queue).not.toContain('Finance reconciliation posts the payment to company balance and revenue.')
  })
})
