import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('Orders mobile workflow UX', () => {
  it('drops the summary cards: the work tabs carry the counts', () => {
    const header = read('src/components/orders/OrdersTabHeader.tsx')
    const tabs = read('src/components/orders/OrdersSubTabs.tsx')

    expect(header).not.toContain('SummaryCard')
    expect(tabs).toContain("{ id: 'action', label: copy('Needs action', 'Perlu tindakan'), count: counts?.action }")
    expect(tabs).toContain('{tab.count}')
  })

  it('has no status chips or sort menu: the list is always in priority order', () => {
    const filters = read('src/components/orders/OrdersTableFilters.tsx')

    expect(filters).not.toContain('STATUS_GROUP_FILTER_OPTIONS')
    expect(filters).not.toContain('Sort orders')
    // The drafts chip stays touch-safe on phones.
    expect(filters).toContain('h-11 shrink-0')
  })

  it('phone rows keep the next action reachable and the stage readable', () => {
    const list = read('src/components/orders/OrderWorkList.tsx')

    expect(list).toContain('lg:hidden')
    expect(list).toContain('inline-flex h-9 shrink-0')
    expect(list).toContain('<StagePill row={row} copy={copy} compact />')
  })

  it('uses compact Orders spacing and a short tablet search placeholder', () => {
    const home = read('src/pages/Home.tsx')

    expect(home).toContain("placeholder: 'Search order #, customer, phone…'")
    expect(home).toContain("tabletPlaceholder: 'Search orders…'")
    expect(home).toContain('<section className="space-y-4 sm:space-y-6">')
  })
})
