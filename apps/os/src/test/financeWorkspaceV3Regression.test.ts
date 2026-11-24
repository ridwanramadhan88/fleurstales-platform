// Release contract for the Finance v3 workspace (Tasks / Cash & Transactions /
// Payroll / Reports). Behaviour is covered by FinanceWorkspace.test.tsx and the
// finance*Domain tests; this file pins the structural rules that keep the
// workspace maintainable.
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const financeFiles = readdirSync('src/components/finance')
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))

describe('Finance workspace v3 regressions', () => {
  it('declares every tab once, in the module registry', () => {
    const domain = read('src/domain/financeWorkspaceDomain.ts')
    const workspace = read('src/components/finance/FinanceWorkspace.tsx')
    expect(domain).toContain("export type FinanceWorkspaceModule = 'tasks' | 'cash' | 'payroll' | 'report'")
    expect(domain).toContain('export const FINANCE_MODULES')
    expect(workspace).toContain('FINANCE_MODULES.filter((module) => access.modules.includes(module.id))')
  })

  it('keeps v2 links working by mapping them onto v3 tabs', () => {
    const domain = read('src/domain/financeWorkspaceDomain.ts')
    expect(domain).toContain("order_verification: 'tasks'")
    expect(domain).toContain("refunds: 'tasks'")
    expect(domain).toContain("ledger: 'cash'")
    expect(domain).toContain("balance: 'cash'")
    expect(read('src/pages/Home.tsx')).toContain('normalizeFinanceRoute(target.financeModule)')
  })

  it('hands off between Finance screens through the typed UI store, not window events', () => {
    for (const file of financeFiles) {
      const source = read(`src/components/finance/${file}`)
      expect(source, file).not.toMatch(/window\.(dispatchEvent|addEventListener)\(['"`]?(new CustomEvent\()?['"]finance-/)
    }
    expect(read('src/components/finance/financeUiStore.ts')).toContain('requestFocus: (focus) =>')
  })

  it('asks the capability matrix instead of hard-coding the Finance role', () => {
    for (const file of financeFiles) {
      const source = read(`src/components/finance/${file}`)
      expect(source, file).not.toMatch(/role !== 'finance'\) return null/)
    }
    expect(read('src/components/finance/useFinanceAccess.ts')).toContain('hasActionPermission(role, capability, actionPermissions, permissions)')
  })

  it('formats money with the shared IDR formatter', () => {
    for (const file of financeFiles) {
      const source = read(`src/components/finance/${file}`)
      expect(source, file).not.toMatch(/const formatIdr = \([^)]*\)[^=]*=>/)
    }
  })

  it('counts Tasks from one domain function used by the badge and the lists', () => {
    const workspace = read('src/components/finance/FinanceWorkspace.tsx')
    expect(workspace).toContain('buildFinanceTasks({ orders, transactions, payrollProposals, payrollDrafts, purchaseCount, searchQuery })')
    expect(workspace).toContain('tasks: badgeCounts.total')
    expect(read('src/domain/financeAttentionDomain.ts')).toContain('reconcilableOrderNumbers(transactions)')
  })

  it('keeps reconciliation review-only: matching never posts the money again', () => {
    const data = read('src/data/orderFinanceReconciliation.ts')
    expect(data).toContain("decideOrderFinanceReconciliation(order, 'verify', undefined, { refresh: false })")
    expect(data).toContain("rpc<OrderFinanceReconciliationResult>(\n    'decide_order_finance_reconciliation'")
  })

  it('keeps category configuration in Finance settings, not on the daily screens', () => {
    const workspace = read('src/components/finance/FinanceWorkspace.tsx')
    expect(workspace).toContain('<FinanceCategorySettingsPanel />')
    expect(read('src/components/finance/ManualTransactionDialog.tsx')).not.toContain('FinanceCategorySettingsPanel')
    expect(read('src/components/finance/FinanceCashTab.tsx')).not.toContain('FinanceCategorySettingsPanel')
  })

  it('mounts the shared order/transaction sheets once, in the workspace', () => {
    for (const file of financeFiles.filter((name) => name !== 'FinanceWorkspace.tsx')) {
      const source = read(`src/components/finance/${file}`)
      expect(source, file).not.toMatch(/<(FinanceTransactionDetailSheet|FinancePostedTransactionEditor|FinanceVoidTransactionDialog)[\s/>]/)
    }
  })
})
