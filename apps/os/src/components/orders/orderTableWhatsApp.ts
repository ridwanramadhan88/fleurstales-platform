import { digitsOnly } from '../../lib/formatters'

export const BRANCH_LOCATION_LINKS: Record<string, string> = {
  Pahoman: 'https://maps.app.goo.gl/tyzUojUyjuAMYNdA9',
  Kedamaian: 'https://maps.app.goo.gl/AW6UF3Lr6SrFWxYBA',
}

/** Normalize Indonesian WhatsApp numbers into wa.me digits. */
export const toWhatsAppPhoneDigits = (rawPhone: string): string => {
  const digits = digitsOnly(rawPhone)
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

export const buildReadyForPickupMessage = (
  customerName: string,
  productName: string,
  branch: string,
  trackingUrl: string,
): string => {
  const locationLink = BRANCH_LOCATION_LINKS[branch] ?? ''
  return `Hi kak ${customerName}, Orderan kakak ${productName} sudah ready yaa 🌸\nLihat foto hasil & lacak pesanan di sini: ${trackingUrl}\nUntuk alamat pick up di ${branch} ${locationLink}`
}

export const buildReadyForDeliveryMessage = (
  customerName: string,
  productName: string,
  trackingUrl: string,
): string =>
  `Hi kak ${customerName}, Orderan kakak ${productName} sudah ready yaa 🌸\nLihat foto hasil & lacak pesanan di sini: ${trackingUrl}\nPesanan akan lanjut ke proses delivery sesuai jadwal ya kak.`

export const buildReviewRequestMessage = (
  customerName: string,
  orderNumber: string,
  trackingUrl: string,
): string =>
  `Hi kak ${customerName}, pesanan ${orderNumber} sudah selesai 🌸\nTerima kasih sudah order di Fleurs Tales. Kalau berkenan, boleh kasih review lewat link ini ya kak: ${trackingUrl}`

/** Build a WhatsApp deep link with a pre-filled message. */
export const buildWhatsAppLink = (phone: string | undefined, message: string): string => {
  const encoded = encodeURIComponent(message)
  if (!phone) return `https://wa.me/?text=${encoded}`
  return `https://wa.me/${toWhatsAppPhoneDigits(phone)}?text=${encoded}`
}
