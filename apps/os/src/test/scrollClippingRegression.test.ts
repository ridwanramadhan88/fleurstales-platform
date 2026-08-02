import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('scroll clipping regression', () => {
  it.each([
    ['src/components/orders/OrdersSubTabs.tsx', 'overflow-x-auto px-4 py-1'],
    ['src/components/finance/FinanceDateScopeTabs.tsx', 'overflow-x-auto px-4 py-1'],
    ['src/components/finance/FinanceWorkspaceTabs.tsx', 'overflow-x-auto px-4 py-1'],
    ['src/components/hr/HrTabContent.tsx', 'overflow-x-auto px-1 py-1'],
    ['src/components/hr/MySchedulePanel.tsx', 'overflow-x-auto px-4 py-1'],
    ['src/components/ui/chip.tsx', 'overflow-x-auto py-1'],
  ])('%s keeps interactive highlights inside its horizontal scroll viewport', (path, safeClass) => {
    expect(read(path)).toContain(safeClass)
  })

  it.each([
    ['src/components/orders/OrderDetailsPanel.tsx', 'overflow-y-auto overflow-x-hidden pb-10'],
    ['src/components/customers/CustomerProfileDrawer.tsx', 'overflow-y-auto overflow-x-hidden px-1'],
    ['src/components/finance/OrderFinanceReviewSheet.tsx', 'overflow-y-auto overflow-x-hidden px-1'],
  ])('%s keeps card strokes inside its vertical drawer viewport', (path, safeClass) => {
    expect(read(path)).toContain(safeClass)
  })

  it('uses inside borders instead of externally clipped rings on scrollable detail sheets', () => {
    for (const path of [
      'src/components/catalog/CatalogProductDetailSheet.tsx',
      'src/components/stock/StockItemDetailSheet.tsx',
    ]) {
      const source = read(path)
      expect(source).toContain('overflow-y-auto rounded-t-2xl border border-border/60')
      expect(source).not.toContain('overflow-y-auto rounded-t-2xl bg-card shadow-ios-lg ring-1')
    }
  })

  it('does not clip Settings editing outlines at the page-shell boundary', () => {
    const source = read('src/components/settings/SettingsCenter.tsx')
    expect(source).not.toContain('overflow-x-clip')
  })

  it('draws scrollable dialog and finance-sheet edges inside their bounds', () => {
    for (const path of [
      'src/components/ui/dialog.tsx',
      'src/components/ui/alert-dialog.tsx',
      'src/components/finance/OrderFinanceReviewSheet.tsx',
      'src/components/finance/FinancePayrollReview.tsx',
    ]) {
      const source = read(path)
      expect(source).not.toContain('shadow-ios-lg ring-1 ring-border/60')
      expect(source).toContain('border border-border/60')
    }
  })
})
