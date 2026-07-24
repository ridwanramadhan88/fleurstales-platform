import { describe, expect, it } from 'vitest'
import {
  buildSingleItemLine,
  deriveLegacyProductIds,
} from './orderLineItemsDomain'

describe('buildSingleItemLine', () => {
  it('builds one line with quantity 1 and unitPriceIdr equal to totalIdr', () => {
    const items = buildSingleItemLine({
      id: 'line_1',
      productId: 'prod_1',
      variantId: 'var_1',
      productName: 'Rose Bouquet',
      totalIdr: 150_000,
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'line_1',
      productId: 'prod_1',
      variantId: 'var_1',
      productName: 'Rose Bouquet',
      quantity: 1,
      unitPriceIdr: 150_000,
    })
  })

  it('falls back to "Custom order" when no productName is given, matching pre-migration behavior', () => {
    const items = buildSingleItemLine({ id: 'line_1', totalIdr: 50_000 })
    expect(items[0].productName).toBe('Custom order')
  })

  it('trims whitespace-only productName down to the fallback', () => {
    const items = buildSingleItemLine({ id: 'line_1', productName: '   ', totalIdr: 50_000 })
    expect(items[0].productName).toBe('Custom order')
  })
})

describe('deriveLegacyProductIds', () => {
  it('derives productId/variantId from a single line', () => {
    const result = deriveLegacyProductIds([
      { id: 'line_1', productId: 'prod_1', variantId: 'var_1', quantity: 1, unitPriceIdr: 1000 },
    ])
    expect(result).toEqual({ productId: 'prod_1', variantId: 'var_1' })
  })

  it('returns undefined for both fields with zero lines', () => {
    expect(deriveLegacyProductIds([])).toEqual({ productId: undefined, variantId: undefined })
  })

  it('returns undefined for both fields with multiple lines', () => {
    const result = deriveLegacyProductIds([
      { id: 'line_1', productId: 'prod_1', quantity: 1, unitPriceIdr: 1000 },
      { id: 'line_2', productId: 'prod_2', quantity: 1, unitPriceIdr: 2000 },
    ])
    expect(result).toEqual({ productId: undefined, variantId: undefined })
  })
})

