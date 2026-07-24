import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('semantic color system regression', () => {
  it('keeps Customers and Catalog neutral while Orders uses restrained semantic summary surfaces', () => {
    const orders = read('src/components/orders/OrdersTabHeader.tsx')
    const customers = read('src/components/customers/CustomersTabContent.tsx')
    const catalog = read('src/components/catalog/CatalogTabContent.tsx')

    expect(orders).toContain("success: 'bg-surface-success ring-success/25'")
    expect(orders).toContain("warning: 'bg-surface-warning ring-warning/25'")
    expect(orders).toContain("info: 'bg-surface-info ring-info/25'")
    expect(orders).toContain("neutral: 'bg-card ring-border'")
    expect(customers.match(/bg-card p-3 ring-1 ring-border\/70/g)?.length).toBeGreaterThanOrEqual(4)
    expect(catalog).toContain("'bg-card ring-1 ring-border/70'")
    expect(orders).not.toContain('bg-success/10 ring-success/30')
    expect(customers).not.toContain('bg-warning/10 p-3 ring-1 ring-warning/20')
  })

  it('uses semantic color for accents and selected states rather than every surface', () => {
    const catalog = read('src/components/catalog/CatalogTabContent.tsx')
    const customers = read('src/components/customers/CustomersTabContent.tsx')

    expect(catalog).toContain('text-muted-foreground')
    expect(catalog).toContain('bg-warning/5 ring-2 ring-warning/45')
    expect(catalog).toContain('bg-info/5 ring-2 ring-info/45')
    expect(customers).toContain('text-xl font-semibold text-warning')
    expect(customers).toContain('Lifetime revenue</p>')
    expect(customers).toContain('text-xl font-semibold text-foreground')
  })

  it('keeps the shared top-bar search neutral until focus', () => {
    const topBar = read('src/components/dashboard/TopBar.tsx')

    expect(topBar).toContain('border border-border/80 bg-card')
    expect(topBar).toContain('focus:border-foreground/25')
    expect(topBar).not.toContain('focus:border-primary/45 focus:ring-2 focus:ring-primary/20')
  })
})
