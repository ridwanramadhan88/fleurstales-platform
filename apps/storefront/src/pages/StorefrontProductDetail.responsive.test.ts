import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync('src/pages/StorefrontProductDetailPage.tsx', 'utf8')
const cssSource = readFileSync('src/shadcn.css', 'utf8')

describe('Storefront product detail responsive UX', () => {
  it('keeps 640–767px small tablets in the stacked mobile flow', () => {
    expect(pageSource).toContain('window.matchMedia("(min-width: 768px)").matches')
    expect(cssSource).toContain('@media (min-width: 768px) and (max-width: 1023px) {\n  .storefront-product-detail-layout')
    expect(cssSource).toContain('@media (min-width: 768px) {\n  .storefront-product-detail-info')
  })

  it('keeps the desktop split layout independent from the tablet breakpoint', () => {
    expect(cssSource).toContain('@media (min-width: 1024px)')
    expect(pageSource).toContain('window.matchMedia("(min-width: 1024px)").matches')
  })
})
