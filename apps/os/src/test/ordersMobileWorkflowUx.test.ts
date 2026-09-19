import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('Orders mobile workflow UX', () => {
  it('keeps the mobile overview compact without shrinking readable labels', () => {
    const header = read('src/components/orders/OrdersTabHeader.tsx')

    expect(header).toContain('rounded-xl p-3')
    expect(header).toContain('sm:rounded-2xl sm:p-4')
    expect(header).toContain('text-xs font-semibold leading-4')
    expect(header).toContain('grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3')
  })

  it('makes status filters touch-safe and visually indicates horizontal overflow', () => {
    const filters = read('src/components/orders/OrdersTableFilters.tsx')

    expect(filters).toContain('className="h-11 shrink-0 md:h-9"')
    expect(filters).toContain('bg-gradient-to-l')
    expect(filters).toContain('md:hidden')
  })

  it('allows mobile order metadata and schedule labels to wrap instead of clipping', () => {
    const cards = read('src/components/orders/OrdersMobileCards.tsx')

    expect(cards).toContain('line-clamp-2 text-sm font-medium')
    expect(cards).toContain('max-w-[48%] shrink-0 whitespace-normal')
    expect(cards).not.toContain('truncate text-2xs leading-tight text-muted-foreground')
  })

  it('uses compact Orders spacing and a short tablet search placeholder', () => {
    const home = read('src/pages/Home.tsx')

    expect(home).toContain("placeholder: 'Search order #, customer, phone…'")
    expect(home).toContain("tabletPlaceholder: 'Search orders…'")
    expect(home).toContain('<section className="space-y-4 sm:space-y-6">')
  })
})
