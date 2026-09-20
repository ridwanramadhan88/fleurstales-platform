import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('Storefront Home and visual polish', () => {
  it('promotes the Home Shop action to a real 48px brand CTA without changing routing', () => {
    const home = read('src/pages/StorefrontHome.tsx')
    const css = read('src/shadcn.css')

    expect(home).toContain('className="storefront-home__hero-shop tap-scale"')
    expect(home).toContain('onClick={onOpenCategories}')
    expect(css).toContain('/* PR #98 — Storefront Home + visual polish.')
    expect(css).toContain('min-height: 3rem;')
    expect(css).toContain('background: #057640;')
    expect(css).toContain('color: #fff8f0;')
    expect(css).toContain('bottom: 16%;')
    expect(css).toContain('left: 8.5%;')
    expect(css).toContain('left: 10%;')
  })

  it('keeps Home CTA contrast and keyboard focus visible', () => {
    const css = read('src/shadcn.css')

    expect(css).toContain('box-shadow: 0 8px 22px rgba(5, 118, 64, 0.18);')
    expect(css).toContain('.storefront-home__hero-shop:focus-visible')
    expect(css).toContain('outline: 3px solid rgba(5, 118, 64, 0.34);')
    expect(css).toContain('background: rgba(255, 248, 240, 0.16);')
  })

  it('adds a mobile top scrim so gallery controls remain readable on light product photos', () => {
    const detail = read('src/pages/StorefrontProductDetailPage.tsx')

    expect(detail).toContain('bg-gradient-to-b from-black/45 via-black/15 to-transparent')
    expect(detail).toContain('pointer-events-none absolute inset-x-0 top-0 z-[9] h-28')
    expect(detail).toContain('inline-flex size-11 -translate-y-1/2')
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
