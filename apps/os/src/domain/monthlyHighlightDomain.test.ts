import { describe, expect, it } from 'vitest'
import { formatHighlightMonth, MONTHLY_HIGHLIGHT_LIMIT, moveHighlightProduct, pickHighlightedProducts, toggleHighlightProduct } from './monthlyHighlightDomain'

describe('flower of the month', () => {
  it('adds, removes and stops at the limit', () => {
    expect(toggleHighlightProduct(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleHighlightProduct(['a', 'b'], 'a')).toEqual(['b'])
    const full = Array.from({ length: MONTHLY_HIGHLIGHT_LIMIT }, (_, index) => `p${index}`)
    expect(toggleHighlightProduct(full, 'extra')).toEqual(full)
  })

  it('reorders within bounds', () => {
    expect(moveHighlightProduct(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b'])
    expect(moveHighlightProduct(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
  })

  it('keeps the chosen order and skips products that are gone', () => {
    const products = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(pickHighlightedProducts(products, ['c', 'x', 'a']).map((product) => product.id)).toEqual(['c', 'a'])
  })

  it('names the month in both languages', () => {
    expect(formatHighlightMonth('2026-11', 'id')).toBe('November 2026')
    expect(formatHighlightMonth('2026-03', 'id')).toBe('Maret 2026')
    expect(formatHighlightMonth('2026-03', 'en')).toBe('March 2026')
  })
})
