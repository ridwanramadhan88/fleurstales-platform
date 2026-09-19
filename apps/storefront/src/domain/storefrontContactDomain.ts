const PLACEHOLDER_CONTACT_VALUES = new Set([
  '+62 812-0000-0000',
  '6281200000000',
  'hello@fleurstales.com',
])

const normalize = (value?: string | null): string => (value ?? '').trim()

export const isPlaceholderStoreContact = (value?: string | null): boolean => {
  const normalized = normalize(value)
  if (!normalized) return false
  if (PLACEHOLDER_CONTACT_VALUES.has(normalized)) return true
  const digits = normalized.replace(/\D/g, '')
  return PLACEHOLDER_CONTACT_VALUES.has(digits)
}

export const getPublicStoreContact = (value?: string | null): string =>
  isPlaceholderStoreContact(value) ? '' : normalize(value)

export const getStorefrontWhatsappHref = (value?: string | null): string | null => {
  const publicValue = getPublicStoreContact(value)
  const digits = publicValue.replace(/\D/g, '')
  if (!digits) return null
  const normalized = digits.startsWith('0') ? `62${digits.slice(1)}` : digits
  return `https://wa.me/${normalized}`
}
