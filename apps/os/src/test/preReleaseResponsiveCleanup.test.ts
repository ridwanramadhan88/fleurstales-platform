import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const catalogFiltersSource = readFileSync('src/components/catalog/CatalogFiltersBar.tsx', 'utf8')
const topBarSource = readFileSync('src/components/dashboard/TopBar.tsx', 'utf8')
const bottomBarSource = readFileSync('src/components/layout/BottomTabBar.tsx', 'utf8')
const sidebarSource = readFileSync('src/components/layout/DesktopSidebar.tsx', 'utf8')

describe('pre-release responsive UI cleanup', () => {
  it('keeps Catalog categories in a dedicated non-wrapping horizontal row', () => {
    expect(catalogFiltersSource).toContain('snap-x snap-mandatory')
    expect(catalogFiltersSource).toContain('overflow-x-auto border-b')
    expect(catalogFiltersSource).not.toContain('md:flex-wrap md:overflow-visible')
    expect(catalogFiltersSource).toContain("scrollIntoView === 'function'")
  })

  it('keeps tablet branch switching in the visible sidebar instead of duplicating it in the top bar', () => {
    expect(topBarSource).toContain('className="hidden min-w-0 items-center md:flex"')
    expect(topBarSource).not.toContain('max-w-20 truncate lg:max-w-28 xl:max-w-40')
  })

  it('keeps phone navigation controls readable and touch-safe', () => {
    expect(topBarSource).toContain('relative flex size-11 items-center')
    expect(topBarSource).toContain('flex h-11 min-w-11 items-center')
    expect(bottomBarSource).toContain('text-xs font-semibold leading-none')
    expect(sidebarSource).toContain('text-[11px] font-semibold uppercase')
  })
})
