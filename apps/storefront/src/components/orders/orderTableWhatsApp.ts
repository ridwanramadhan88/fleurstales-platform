import { digitsOnly } from '../../lib/formatters'

export const BRANCH_LOCATION_LINKS: Record<string, string> = {
  Pahoman: 'https://maps.app.goo.gl/tyzUojUyjuAMYNdA9',
  Kedamaian: 'https://maps.app.goo.gl/AW6UF3Lr6SrFWxYBA',
}

/**
 * @description Normalizes a local Indonesian WhatsApp number (e.g.
 * "0819 7777 8888") into the digits-only, country-code-prefixed format
 * wa.me expects (e.g. "6281977778888").
 */
export const toWhatsAppPhoneDigits = (rawPhone: string): string => {
  const digits = digitsOnly(rawPhone)
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

/**
 * @description Builds the "your order is ready for pickup" WhatsApp message
 * text, per the required copy/template.
 */
export const buildReadyForPickupMessage = (
  customerName: string,
  productName: string,
  branch: string,
): string => {
  const locationLink = BRANCH_LOCATION_LINKS[branch] ?? ''
  return `Hi kak ${customerName}, Orderan kakak ${productName} sudah ready yaa. Untuk alamat pick up di ${branch} ${locationLink}`
}

/**
 * @description Builds a wa.me deep link that pre-fills the given message. If
 * no WhatsApp number is known, falls back to the generic WhatsApp compose link
 * (opens the app so staff can still pick the contact manually).
 */
export const buildWhatsAppLink = (phone: string | undefined, message: string): string => {
  const encoded = encodeURIComponent(message)
  if (!phone) return `https://wa.me/?text=${encoded}`
  return `https://wa.me/${toWhatsAppPhoneDigits(phone)}?text=${encoded}`
}
