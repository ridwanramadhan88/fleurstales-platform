import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('Storefront Home and visual polish', () => {
  it('restores the pre-#98 Home Shop presentation without changing routing', () => {
    const home = read('src/pages/StorefrontHome.tsx')
    const css = read('src/shadcn.css')

    expect(home).toContain('className="storefront-home__hero-shop tap-scale"')
    expect(home).toContain('onClick={onOpenCategories}')
    expect(css).not.toContain('/* PR #98 — Storefront Home + visual polish.')
    expect(css).toContain('/* Keep the homepage Shop action identical at every breakpoint: text, arrow,')
    expect(css).toContain('border-bottom: 2px solid #057640;')
    expect(css).toContain('background: transparent;')
    expect(css).toContain('color: #057640;')
    expect(css).toContain('box-shadow: none;')
  })

  it('adds a mobile top scrim so gallery controls remain readable on light product photos', () => {
    const detail = read('src/pages/StorefrontProductDetailPage.tsx')

    expect(detail).toContain('bg-gradient-to-b from-black/45 via-black/15 to-transparent')
    expect(detail).toContain('pointer-events-none absolute inset-x-0 top-0 z-[9] h-28')
    expect(detail).toContain('inline-flex size-11 -translate-y-1/2')
  })

  it('keeps the live collection swipe hint at 12px or larger', () => {
    const css = read('src/shadcn.css')

    expect(css).toContain('.storefront-navigation-collections__heading span {')
    expect(css).toContain('font-size: 0.75rem;')
    expect(css).not.toContain('font-size: 0.68rem;')
  })

  it('removes the duplicate tracking search heading and gives loading state structure', () => {
    const tracking = read('src/pages/StorefrontOrderTrackingPage.tsx')

    expect(tracking).toContain('<h1 className="mt-2')
    expect(tracking).not.toContain('<h2 className="sf-type-4 font-display">Cari pesanan</h2>')
    expect(tracking).toContain('role="status"')
    expect(tracking).toContain('aria-live="polite"')
    expect(tracking).toContain('animate-pulse')
    expect(tracking).not.toContain('text-2xs')
  })

  it('uses an intentional translated empty product state', () => {
    const collections = read('src/components/storefront/StorefrontProductCollections.tsx')

    expect(collections).toContain('role="status"')
    expect(collections).toContain('No products found')
    expect(collections).toContain('No products match this collection. Try a different category or type.')
  })
})
