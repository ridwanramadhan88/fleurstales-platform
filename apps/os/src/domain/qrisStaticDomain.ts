/**
 * Static QRIS source (25 Nov 2026). The Owner uploads the branch's static
 * QRIS image only so the browser can read the text inside it; the server
 * validates it again (private.parse_static_qris) and keeps it private. The
 * image itself is never stored or shown to customers.
 */

export interface StaticQrisDetails {
  merchantName: string
  nmid: string
  merchantCriteria: string | null
  mcc: string | null
  acquirer: string | null
}

export type StaticQrisError = 'QRIS_NOT_FOUND' | 'QRIS_INVALID' | 'QRIS_NOT_STATIC'

export class StaticQrisReadError extends Error {
  constructor(readonly code: StaticQrisError) {
    super(code)
  }
}

export const qrisCrc16 = (text: string): string => {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

const parseTlv = (payload: string): Array<[string, string]> => {
  const items: Array<[string, string]> = []
  let index = 0
  while (index < payload.length) {
    const head = payload.slice(index, index + 4)
    if (!/^\d{4}$/.test(head)) throw new StaticQrisReadError('QRIS_INVALID')
    const length = Number(head.slice(2))
    if (index + 4 + length > payload.length) throw new StaticQrisReadError('QRIS_INVALID')
    items.push([head.slice(0, 2), payload.slice(index + 4, index + 4 + length)])
    index += 4 + length
  }
  return items
}

/** Mirrors private.parse_static_qris so the Owner sees a clear error before saving. */
export const parseStaticQris = (raw: string): StaticQrisDetails => {
  const payload = raw.trim()
  if (!payload || payload.length > 512 || !/^[\x20-\x7E]+$/.test(payload)) throw new StaticQrisReadError('QRIS_INVALID')
  if (!/6304[0-9A-Fa-f]{4}$/.test(payload) || qrisCrc16(payload.slice(0, -4)) !== payload.slice(-4).toUpperCase()) {
    throw new StaticQrisReadError('QRIS_INVALID')
  }
  const items = parseTlv(payload)
  const tags = new Map(items)
  if (tags.get('00') !== '01' || tags.get('53') !== '360' || tags.get('58') !== 'ID' || !tags.get('59')) {
    throw new StaticQrisReadError('QRIS_INVALID')
  }
  if (tags.get('01') !== '11' || tags.has('54')) throw new StaticQrisReadError('QRIS_NOT_STATIC')
  const merchantInfo = new Map(tags.get('51') ? parseTlv(tags.get('51') ?? '') : [])
  const nmid = merchantInfo.get('02') ?? ''
  if (!/^ID[0-9A-Z]{8,}$/.test(nmid)) throw new StaticQrisReadError('QRIS_INVALID')
  const template = items.find(([tag]) => tag >= '26' && tag <= '45')
  const acquirer = template ? new Map(parseTlv(template[1])).get('00') ?? null : null
  return {
    merchantName: (tags.get('59') ?? '').trim(),
    nmid,
    merchantCriteria: merchantInfo.get('03') ?? null,
    mcc: tags.get('52') ?? null,
    acquirer,
  }
}

/** "ID.CO.BANKMANDIRI.WWW" → "BANKMANDIRI", for matching against a bank account name. */
export const acquirerKey = (acquirer: string | null | undefined): string =>
  (acquirer ?? '').toUpperCase().replace(/^ID\.CO\./, '').replace(/\.WWW$/, '').replace(/[^A-Z0-9]/g, '')

/** True when the QRIS acquirer bank and the linked account's bank look different (e.g. Mandiri QRIS → BCA account). */
export const qrisBankMismatch = (acquirer: string | null | undefined, bankName: string | null | undefined): boolean => {
  const key = acquirerKey(acquirer)
  const bank = (bankName ?? '').toUpperCase().replace(/^BANK\s*/, '').replace(/[^A-Z0-9]/g, '')
  if (!key || !bank) return false
  return !key.includes(bank) && !bank.includes(key.replace(/^BANK/, ''))
}

export const merchantCriteriaLabel = (criteria: string | null | undefined): string => {
  switch ((criteria ?? '').toUpperCase()) {
    case 'UMI': return 'Usaha mikro (UMI)'
    case 'UKE': return 'Usaha kecil (UKE)'
    case 'UME': return 'Usaha menengah (UME)'
    case 'UBE': return 'Usaha besar (UBE)'
    default: return criteria ? criteria : '-'
  }
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>>
}

const loadImage = async (file: Blob): Promise<HTMLImageElement> => {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new StaticQrisReadError('QRIS_NOT_FOUND'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Reads the QR text from an uploaded image, in the browser only. */
export const readQrTextFromImage = async (file: Blob): Promise<string> => {
  const image = await loadImage(file)
  const Detector = (globalThis as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector
  if (Detector) {
    try {
      const found = await new Detector({ formats: ['qr_code'] }).detect(image)
      const text = found.find((item) => item.rawValue)?.rawValue
      if (text) return text
    } catch {
      // fall through to jsQR
    }
  }
  const maxSide = 1600
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new StaticQrisReadError('QRIS_NOT_FOUND')
  context.drawImage(image, 0, 0, width, height)
  const { default: jsQR } = await import('jsqr')
  const result = jsQR(context.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: 'attemptBoth' })
  if (!result?.data) throw new StaticQrisReadError('QRIS_NOT_FOUND')
  return result.data
}
