import { describe, expect, it } from 'vitest'
import { SEED_PRODUCTS } from '../store/catalogStoreSeedData'

const confirmedTypos = [
  'Artifical',
  'Garbera',
  'Raibow',
  'Fuschia',
  'Anmber',
]

describe('catalog data quality', () => {
  it('keeps catalog prices within the reviewed retail range', () => {
    const prices = SEED_PRODUCTS.flatMap((product) =>
      product.variants.map((variant) => variant.price),
    )

    expect(Math.min(...prices)).toBeGreaterThan(0)
    expect(Math.max(...prices)).toBeLessThanOrEqual(2_500_000)
  })

  it('keeps confirmed spelling mistakes out of customer-facing names', () => {
    const names = SEED_PRODUCTS.map((product) => product.name)
    for (const typo of confirmedTypos) {
      expect(names.some((name) => name.includes(typo))).toBe(false)
    }
  })

  it('uses the reviewed starting price for the mixed Phalaenopsis bouquet', () => {
    const product = SEED_PRODUCTS.find(
      (item) => item.id === 'catalog_mix_phalaenopsis_bridal_bouquet_163',
    )

    expect(product?.pricingType).toBe('Starts From')
    expect(product?.variants[0]?.price).toBe(1_100_000)
  })
})
