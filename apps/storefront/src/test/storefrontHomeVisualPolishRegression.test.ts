import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('Storefront Home and visual polish regressions', () => {
  it('keeps the Home CTA a real 48px brand action at phone, tablet, and desktop breakpoints', () => {
    const css = read('src/shadcn.css')

    expect(css).toContain('/* PR #98 — Storefront Home + visual polish.')
    expect(css).toContain('.storefront-home__hero-shop {')
    expect(css).toContain('min-height: 3rem;')
    expect(css).toContain('background: #057640;')
    expect(css).toContain('background: #f684b1;')
    expect(css).toContain('top: 57%;')
    expect(css).toContain('@media (min-width: 640px) and (max-width: 1023px)')
    expect(css).toContain('top: 61%;')
    expect(css).toContain('@media (min-width: 1024px)')
    expect(css).toContain('top: 62%;')
    expect(css).toContain('left: 6%;')
  })

  it('keeps the product-detail back and cart controls readable over light photos', () => {
    const detail = read('src/pages/StorefrontProductDetailPage.tsx')

    expect(detail).toContain('bg-gradient-to-b from-black/40 via-black/16 to-transparent')
    expect(detail).toContain('pointer-events-none')
    expect(detail).toContain('z-[9] h-28')
    expect(detail).toContain('z-10 flex items-center justify-between')
  })

  it('never renders the live collection swipe hint below 12px', () => {
    const css = read('src/shadcn.css')

    expect(css).toContain('.storefront-navigation-collections__heading span {')
    expect(css).toContain('font-size: 0.75rem;')
    expect(css).not.toContain('font-size: 0.68rem;')
  })

  it('keeps Tracking free of the redundant search-card heading and preserves the loading skeleton', () => {
    const tracking = read('src/pages/StorefrontOrderTrackingPage.tsx')

    expect(tracking).toContain('Lacak pesanan')
    expect(tracking).not.toContain('<h2 className="sf-type-4 font-display">Cari pesanan</h2>')
    expect(tracking).toContain('role="status"')
    expect(tracking).toContain('Memuat pesanan…')
    expect(tracking).toContain('animate-pulse')
  })

  it('keeps the shop empty state structured and announced without adding a dead-end action', () => {
    const collections = read('src/components/storefront/StorefrontProductCollections.tsx')

    expect(collections).toContain('role="status"')
    expect(collections).toContain('No products found')
    expect(collections).toContain('No products match this collection. Try a different category or type.')
  })
})
