import { describe, expect, it } from 'vitest'
import { formatIdr } from './currency'

describe('formatIdr', () => {
  it('uses the storefront Rp. prefix and Indonesian grouping', () => {
    expect(formatIdr(175000)).toBe('Rp. 175.000')
    expect(formatIdr(0)).toBe('Rp. 0')
  })
})
