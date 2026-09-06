import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

const pageTitleClass = 'font-display text-2xl font-semibold leading-tight text-foreground'

describe('heading and title consistency', () => {
  it('uses the Customers page-title scale across primary application pages', () => {
    const files = [
      'src/components/customers/CustomersTabContent.tsx',
      'src/components/orders/OrdersTabHeader.tsx',
      'src/components/dashboard/DashboardHeader.tsx',
      'src/components/dashboard/RevenueDashboard.tsx',
      'src/components/settings/SettingsCenter.tsx',
    ]

    for (const file of files) expect(read(file)).toContain(pageTitleClass)
    // Finance modules share one header carrying the same scale; each module
    // renders that header instead of its own inline title.
    expect(read('src/components/finance/FinanceModuleHeader.tsx')).toContain(
      pageTitleClass,
    )
    for (const file of [
      'src/components/finance/OrderVerificationQueue.tsx',
      'src/components/finance/AddInternalTransaction.tsx',
      'src/components/finance/FinanceCashFlowOverview.tsx',
      'src/components/finance/FinanceRefundQueue.tsx',
      'src/pages/Home.tsx',
    ])
      expect(read(file)).toContain('FinanceModuleHeader')
  })

  it('uses one title scale for sheets and dialogs', () => {
    expect(read('src/components/ui/sheet.tsx')).toContain(
      'font-display text-lg font-semibold leading-6 text-foreground',
    )
    expect(read('src/components/ui/dialog.tsx')).toContain(
      'font-display text-lg font-semibold leading-6',
    )
    expect(read('src/components/ui/alert-dialog.tsx')).toContain(
      'font-display text-lg font-semibold leading-6 text-foreground',
    )
  })

  it('keeps the Customers mobile top rhythm and avoids a repeated Finance title', () => {
    expect(read('src/pages/Home.tsx')).toContain(
      'px-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-6',
    )
    expect(read('src/pages/Home.tsx')).toContain(
      'showHeading={financeModules.length > 1}',
    )
    expect(read('src/components/finance/OrderVerificationQueue.tsx')).toContain(
      '{showHeading && (',
    )
  })
})