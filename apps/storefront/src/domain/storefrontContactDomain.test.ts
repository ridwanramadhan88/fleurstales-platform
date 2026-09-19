import { describe, expect, it } from 'vitest'
import { getPublicStoreContact, getStorefrontWhatsappHref, isPlaceholderStoreContact } from './storefrontContactDomain'

describe('storefront contact guards', () => {
  it('suppresses seeded placeholder contact values', () => {
    expect(isPlaceholderStoreContact('+62 812-0000-0000')).toBe(true)
    expect(isPlaceholderStoreContact('hello@fleurstales.com')).toBe(true)
    expect(getPublicStoreContact('+62 812-0000-0000')).toBe('')
    expect(getStorefrontWhatsappHref('+62 812-0000-0000')).toBeNull()
  })

  it('keeps real contact values usable', () => {
    expect(getPublicStoreContact('+62 812-3456-7890')).toBe('+62 812-3456-7890')
    expect(getStorefrontWhatsappHref('0812-3456-7890')).toBe('https://wa.me/6281234567890')
  })
})
