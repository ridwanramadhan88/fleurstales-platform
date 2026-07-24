import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('chip, tab, card and section spacing system', () => {
  it('keeps interactive chips and status badges visually distinct', () => {
    const chip = read('src/components/ui/chip.tsx')

    expect(chip).toContain('inline-flex h-9')
    expect(chip).toContain('border px-3.5 text-sm')
    expect(chip).toContain('inline-flex min-h-6')
    expect(chip).toContain('px-2 py-0.5 text-xs')
    expect(chip).toContain('gap-2 overflow-x-auto')
    expect(chip).toContain("page: '-mx-4 px-4 scroll-px-4'")
  })

  it('keeps primary and secondary tabs dimensionally stable', () => {
    const tabs = read('src/components/ui/tabs.tsx')

    expect(tabs).toContain('level === "primary" ? "h-11 px-[18px]" : "h-9 px-3.5"')
    expect(tabs).toContain('active')
    expect(tabs).toContain('min-h-11 items-center justify-center gap-1')
    expect(tabs).toContain('inline-flex h-9')
  })

  it('defines only the three intended card densities and shared internal rhythm', () => {
    const card = read('src/components/ui/card.tsx')
    const overviewCard = read('src/components/ui/overview-card.tsx')

    expect(card).toContain("export type SurfaceCardDensity = 'dense' | 'standard' | 'summary'")
    expect(card).toContain("dense: 'p-3'")
    expect(card).toContain("standard: 'p-3.5'")
    expect(card).toContain("summary: 'p-4'")
    expect(card).toContain("cardHeaderClass = 'flex items-start justify-between gap-3'")
    expect(card).toContain("cardBodyClass = 'mt-2.5'")
    expect(card).toContain("cardActionsClass = 'mt-3'")
    expect(card).toContain("dividedCardActionsClass = 'mt-3 border-t border-border/60 pt-3'")
    expect(overviewCard).toContain('min-h-20')
    expect(overviewCard).toContain('rounded-xl bg-surface-card p-3.5')
  })

  it('uses parent-driven section spacing and consistent focused-workflow clearance', () => {
    const section = read('src/components/ui/section.tsx')
    const payroll = read('src/components/finance/FinancePayrollReview.tsx')
    const orderDetails = read('src/components/orders/OrderDetailsPanel.tsx')
    const financeReview = read('src/components/finance/OrderFinanceReviewSheet.tsx')
    const orderActions = read('src/components/orders/OrderDetailsActionsSection.tsx')

    expect(section).toContain("majorSectionStackClass = 'space-y-5'")
    expect(section).toContain("sectionContentStackClass = 'space-y-3'")
    expect(payroll).toContain('className="space-y-5"')
    expect(payroll).toContain('min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-4')
    expect(payroll).toContain('shrink-0 border-t border-border bg-card px-5 py-3')
    expect(orderDetails).toContain('space-y-6')
    expect(financeReview).toContain('space-y-6')
    expect(orderActions).toContain('-mx-4')
    expect(orderActions).toContain('px-4 py-3')
  })

  it('does not reintroduce doubled inner horizontal padding in focused details', () => {
    const orderItems = read('src/components/orders/OrderDetailsItemsSection.tsx')
    const financeReview = read('src/components/finance/OrderFinanceReviewSheet.tsx')
    const customerDrawer = read('src/components/customers/CustomerProfileDrawer.tsx')

    expect(orderItems).not.toContain('px-2 sm:px-0')
    expect(orderItems).not.toContain('mx-2 grid')
    expect(financeReview).not.toContain('px-0.5')
    expect(customerDrawer).not.toContain('px-0.5')
  })
})
