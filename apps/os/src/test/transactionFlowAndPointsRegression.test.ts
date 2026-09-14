import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('transaction flow and Points navigation regression', () => {
  it('keeps transaction creation direction-first and moves category management out of daily Transactions', () => {
    const source = read('src/components/finance/AddInternalTransaction.tsx')
    const categorySettings = read('src/components/settings/FinanceCategorySettingsPanel.tsx')
    expect(source).toContain('Money In')
    expect(source).toContain('Money Out')
    expect(source).not.toContain('Manage categories')
    expect(source).toContain('Settings → Finance')
    expect(source).toContain('Note · Optional')
    expect(source).not.toContain('Add internal transaction')
    expect(categorySettings).toContain('Transaction categories')
    expect(categorySettings).toContain('Add category')
  })

  it('removes the standalone HR Points Ledger tab', () => {
    const source = read('src/components/hr/HrPointsSection.tsx')
    expect(source).toContain("(['overview', 'rules'] as const)")
    expect(source).not.toContain("'ledger'")
    expect(source).toContain('Point reviews')
  })

  it('protects system categories and preserves custom category history', () => {
    const source = read('src/domain/financeTransactionCategoryDomain.ts')
    expect(source).toContain("builtIn('payroll'")
    expect(source).toContain('manuallyCreatable:true')
    const store = read('src/store/financeStore.ts')
    expect(store).toContain('This category is already used by transactions. Deactivate it instead.')
    expect(source).toContain('systemKey:id')
  })
})
