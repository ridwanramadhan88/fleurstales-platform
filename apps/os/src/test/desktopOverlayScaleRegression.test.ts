import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('desktop and tablet overlay scale', () => {
  it('defines distinct compact, standard, wide and workspace dialog tiers', () => {
    const appDialog = read('src/components/ui/app-dialog.tsx')
    const appSheet = read('src/components/ui/app-sheet.tsx')

    expect(appDialog).toContain("type AppDialogSize = 'compact' | 'standard' | 'wide' | 'workspace'")
    expect(appDialog).toContain("workspace: 'sm:w-[calc(100vw-2rem)] sm:max-w-5xl md:max-w-6xl xl:max-w-7xl'")
    expect(appSheet).toContain("type AppSheetSize = 'compact' | 'standard' | 'wide' | 'workspace'")
    expect(appSheet).toContain("standard: 'sm:max-w-3xl md:max-w-4xl'")
    expect(appSheet).toContain("workspace: 'sm:max-w-5xl md:max-w-6xl xl:max-w-7xl'")
    expect(appSheet).toContain("wide: 'sm:w-[min(46rem,90vw)] md:w-[min(52rem,76vw)] lg:w-[min(56rem,68vw)]'")
  })

  it('keeps data-heavy workflows on wide or workspace surfaces', () => {
    const newOrder = read('src/components/orders/NewOrderSheet.tsx')
    const orderDetails = read('src/components/orders/OrderDetailsPanel.tsx')
    const financeReview = read('src/components/finance/OrderFinanceReviewSheet.tsx')
    const customer = read('src/components/customers/CustomerProfileDrawer.tsx')
    const assignFlorist = read('src/components/orders/AssignFloristDialog.tsx')
    const catalogForm = read('src/components/catalog/CatalogItemFormSheet.tsx')

    expect(newOrder).toContain('sm:max-w-5xl')
    expect(newOrder).toContain('md:max-w-6xl')
    expect(orderDetails).toContain('size="workspace"')
    expect(financeReview).toContain('md:max-w-6xl')
    expect(customer).toContain('side="responsiveRight"')
    expect(customer).toContain('size="wide"')
    expect(assignFlorist).toContain('size="wide"')
    expect(catalogForm).toContain('size="workspace"')
  })

  it('does not cap complex desktop workflows at phone-sized widths', () => {
    const complexFiles = [
      'src/components/orders/AssignFloristDialog.tsx',
      'src/components/orders/OrderChangeRequestModal.tsx',
      'src/components/orders/OrderRefundDialog.tsx',
      'src/components/customers/CustomerProfileDrawer.tsx',
      'src/components/hr/AttendanceReviewQueue.tsx',
      'src/components/hr/HrPayrollSection.tsx',
      'src/components/stock/StockItemFormSheet.tsx',
      'src/components/catalog/CatalogProductDetailSheet.tsx',
      'src/components/stock/StockItemDetailSheet.tsx',
    ]

    for (const file of complexFiles) {
      const source = read(file)
      expect(source).not.toContain('max-w-sm')
      expect(source).not.toContain('max-w-md')
      expect(source).not.toContain('sm:max-w-lg')
    }
  })
})
