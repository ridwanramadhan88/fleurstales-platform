import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('final Storefront accessibility and responsive audit', () => {
  it('keeps custom menu and search overlays keyboard-contained and restores focus', () => {
    const hook = read('src/hooks/useStorefrontModalFocus.ts')
    const navigation = read('src/components/storefront/StorefrontNavigationDrawer.tsx')
    const search = read('src/components/storefront/StorefrontSearchPanel.tsx')

    expect(hook).toContain("event.key !== 'Tab'")
    expect(hook).toContain('previousFocus?.isConnected')
    expect(hook).toContain('last.focus()')
    expect(hook).toContain('first.focus()')
    expect(navigation).toContain('useStorefrontModalFocus<HTMLElement>')
    expect(navigation).toContain('aria-labelledby="storefront-navigation-title"')
    expect(navigation).toContain('tabIndex={open ? 0 : -1}')
    expect(navigation).toContain('aria-label="Close navigation menu"')
    expect(search).toContain('useStorefrontModalFocus<HTMLDivElement>')
    expect(search).toContain('className="storefront-search-panel__close tap-scale"')
    expect(search).toContain('tabIndex={-1}')
  })

  it('keeps phone and desktop product-gallery pagination targets at least 44px', () => {
    const css = read('src/shadcn.css')

    expect(css).toContain('.storefront-gallery-dot {')
    expect(css).toContain('width: 2.75rem;')
    expect(css).toContain('height: 2.75rem;')
    expect(css).not.toContain('width: 0.42rem;')
    expect(css).not.toContain('height: 0.42rem;')
  })

  it('keeps search controls and brand navigation touch-safe at narrow widths', () => {
    const css = read('src/shadcn.css')
    const header = read('src/components/storefront/StorefrontHeader.tsx')

    expect(css).toContain('.storefront-search-form__clear {')
    expect(css).toContain('width: 2.75rem;')
    expect(css).toContain('.storefront-search-form__submit {')
    expect(css).toContain('min-height: 2.75rem;')
    expect(css).toContain('.storefront-search-panel__actions {')
    expect(header).toContain('min-h-11 min-w-0 items-center')
  })

  it('keeps the navigation drawer viewport-safe from 320px phones through desktop', () => {
    const css = read('src/shadcn.css')

    expect(css).toContain('width: min(80vw, 25rem);')
    expect(css).toContain('padding: 2rem 1.5rem calc(3rem + env(safe-area-inset-bottom));')
    expect(css).toContain('@media (min-width: 640px)')
    expect(css).toContain('@media (min-width: 1024px)')
  })
})
