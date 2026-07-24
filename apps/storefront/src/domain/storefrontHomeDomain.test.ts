import { describe, expect, it } from 'vitest'
import { resolveStorefrontHomeCategory } from './storefrontHomeDomain'

const categories = [
  'Birthday',
  'Anniversary',
  'General Gifting',
  'Graduation',
  'Congratulations',
  'Wedding',
  'Condolence',
]

describe('resolveStorefrontHomeCategory', () => {
  it('routes homepage occasion cards to configured occasion categories', () => {
    expect(resolveStorefrontHomeCategory('Birthday', categories)).toBe('Birthday')
    expect(resolveStorefrontHomeCategory('General Gifting', categories)).toBe('General Gifting')
    expect(resolveStorefrontHomeCategory('Graduation', categories)).toBe('Graduation')
    expect(resolveStorefrontHomeCategory('Congratulations', categories)).toBe('Congratulations')
  })

  it('falls back to all when an occasion category is unavailable', () => {
    expect(resolveStorefrontHomeCategory('Graduation', ['Birthday'])).toBe('all')
  })
})
