export const STORE_LOGO_MAX_BYTES = 1_000_000

export const STORE_LOGO_ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const

export type StoreLogoAcceptedType = (typeof STORE_LOGO_ACCEPTED_TYPES)[number]

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Logo gagal dibaca.'))
    reader.readAsDataURL(file)
  })

const hasUnsafeSvgContent = (svg: string): boolean => {
  const normalized = svg.toLocaleLowerCase()
  return (
    /<\s*(script|foreignobject|iframe|object|embed)\b/.test(normalized) ||
    /\son[a-z]+\s*=/.test(normalized) ||
    /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|javascript:)/.test(normalized)
  )
}

export const validateStoreLogoFile = (file: File): string | null => {
  if (!STORE_LOGO_ACCEPTED_TYPES.includes(file.type as StoreLogoAcceptedType)) {
    return 'Gunakan file PNG, JPG, WebP, atau SVG.'
  }
  if (file.size > STORE_LOGO_MAX_BYTES) {
    return 'Ukuran logo maksimal 1 MB.'
  }
  return null
}

export const createStoreLogoDataUrl = async (file: File): Promise<string> => {
  const validationError = validateStoreLogoFile(file)
  if (validationError) throw new Error(validationError)

  if (file.type !== 'image/svg+xml') return readAsDataUrl(file)

  const svg = await file.text()
  if (hasUnsafeSvgContent(svg)) {
    throw new Error('SVG mengandung elemen yang tidak didukung.')
  }

  return readAsDataUrl(new Blob([svg], { type: 'image/svg+xml' }))
}

export const isSupportedStoreLogoValue = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i.test(trimmed)) return true

  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
