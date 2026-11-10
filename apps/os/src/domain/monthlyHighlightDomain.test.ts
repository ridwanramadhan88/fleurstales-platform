import { describe, expect, it } from 'vitest'
import { formatHighlightMonth, MONTHLY_HIGHLIGHT_LIMIT, pickHighlightedProducts, toggleHighlightProduct } from './monthlyHighlightDomain'

describe('flower of the month', () => {
  it('keeps a single pick: choosing replaces, choosing again clears', () => {
    expect(MONTHLY_HIGHLIGHT_LIMIT).toBe(1)
    expect(toggleHighlightProduct([], 'a')).toEqual(['a'])
    expect(toggleHighlightProduct(['a'], 'b')).toEqual(['b'])
    expect(toggleHighlightProduct(['a'], 'a')).toEqual([])
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
