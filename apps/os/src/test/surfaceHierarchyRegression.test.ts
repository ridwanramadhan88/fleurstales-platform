import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('surface hierarchy regressions', () => {
  it('defines the complete semantic surface token ladder', () => {
    const css = read('src/shadcn.css')
    for (const token of [
      '--surface-page',
      '--surface-card',
      '--surface-panel',
      '--surface-track',
      '--surface-selected',
      '--surface-footer',
      '--surface-popover',
      '--surface-neutral-badge',
      '--surface-warning',
      '--surface-success',
      '--surface-info',
      '--surface-error',
    ]) expect(css).toContain(token)
  })

  it('uses semantic surfaces in shared cards, tabs, chips and overlays', () => {
    expect(read('src/components/ui/card.tsx')).toContain('bg-surface-card')
    expect(read('src/components/ui/tabs.tsx')).toContain('bg-surface-track')
    expect(read('src/components/ui/tabs.tsx')).toContain('bg-surface-selected')
    expect(read('src/components/ui/chip.tsx')).toContain('bg-surface-neutral')
    expect(read('src/components/ui/popover.tsx')).toContain('bg-surface-popover')
    expect(read('src/components/ui/select.tsx')).toContain('bg-surface-popover')
    expect(read('src/components/ui/sheet.tsx')).toContain('bg-surface-card')
    expect(read('src/components/ui/action-footer.tsx')).toContain('bg-surface-footer')
  })

  it('keeps operational popovers and fixed mobile footers fully opaque', () => {
    const popover = read('src/components/ui/popover.tsx')
    const select = read('src/components/ui/select.tsx')
    const dropdown = read('src/components/ui/dropdown-menu.tsx')
    const bottomTabs = read('src/components/layout/BottomTabBar.tsx')

    expect(popover).not.toContain('bg-popover/95')
    expect(popover).not.toContain('backdrop-blur-xl')
    expect(select).not.toContain('bg-popover/95')
    expect(dropdown).not.toContain('bg-popover/95')
    expect(bottomTabs).toContain('bg-surface-footer')
    expect(bottomTabs).not.toContain('backdrop-blur-xl')
  })

  it('does not use faint charcoal tints for active shared chips or tabs', () => {
    const chip = read('src/components/ui/chip.tsx')
    const tabs = read('src/components/ui/tabs.tsx')
    expect(chip).toContain('bg-surface-selected')
    expect(chip).not.toContain("? 'border-primary/20 bg-primary/10")
    expect(tabs).toContain('bg-surface-selected')
    expect(tabs).not.toContain('data-[state=active]:bg-card')
  })
})
