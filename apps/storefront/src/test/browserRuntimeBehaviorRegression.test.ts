import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')

describe('storefront browser runtime behavior', () => {
  it('prevents mobile form-focus zoom without disabling viewport scaling', () => {
    const css = read('src/shadcn.css')
    const html = read('index.html')

    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toContain('font-size: 16px !important')
    expect(html).not.toContain('user-scalable=no')
    expect(html).not.toContain('maximum-scale=1')
  })

  it('opens Storefront pages and category tabs at the top', () => {
    const storefront = read('src/pages/Storefront.tsx')
    const categories = read('src/pages/StorefrontCategoriesPage.tsx')

    expect(storefront).toContain('window.scrollTo({ top: 0')
    expect(categories).toContain("window.scrollTo({ top: 0, left: 0, behavior: 'auto' })")
    expect(categories).toContain('[activeTab]')
  })
})
