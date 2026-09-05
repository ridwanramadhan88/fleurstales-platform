/**
 * @file orderFinishPhotoDomain.ts
 * @description Mandatory "order finished" photo captured at the Ready
 * transition. Adapted from catalogImageDomain.ts but with a 4:5 portrait
 * output (instead of a square) and a dedicated Storage bucket.
 */

export const FINISH_PHOTO_WIDTH_PX = 800
export const FINISH_PHOTO_HEIGHT_PX = 1000
export const FINISH_PHOTO_MAX_BYTES = 100 * 1024
export const FINISH_PHOTO_BUCKET = 'order-finish-photos'
export const FINISH_PHOTO_MIME_TYPE = 'image/jpeg' as const

export interface FinishPhotoCrop {
  zoom: number
  offsetX: number
  offsetY: number
}

export const getDataUrlByteSize = (dataUrl: string): number => {
  const base64 = dataUrl.split(',')[1] ?? ''
  const padding = base64.match(/=+$/)?.[0].length ?? 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

const safeObjectSegment = (value: string): string => {
  const safe = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || 'order'
}

export const buildFinishPhotoStoragePath = (orderId: string): string => {
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${safeObjectSegment(orderId)}/finish-${nonce}.jpg`
}

/**
 * Draws the source image into a 4:5 (width x height) canvas using the same
 * zoom/offset crop model as drawCatalogImageCrop, just non-square.
 */
export const drawFinishPhotoCrop = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  crop: FinishPhotoCrop,
): void => {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image editor is unavailable in this browser.')

  const outputWidth = FINISH_PHOTO_WIDTH_PX
  const outputHeight = FINISH_PHOTO_HEIGHT_PX
  canvas.width = outputWidth
  canvas.height = outputHeight

  context.clearRect(0, 0, outputWidth, outputHeight)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, outputWidth, outputHeight)

  const safeZoom = Math.min(3, Math.max(1, crop.zoom))
  const baseScale = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight)
  const scale = baseScale * safeZoom
  const renderedWidth = image.naturalWidth * scale
  const renderedHeight = image.naturalHeight * scale
  const maxShiftX = Math.max(0, (renderedWidth - outputWidth) / 2)
  const maxShiftY = Math.max(0, (renderedHeight - outputHeight) / 2)
  const normalizedX = Math.min(1, Math.max(-1, crop.offsetX))
  const normalizedY = Math.min(1, Math.max(-1, crop.offsetY))

  const destinationX = (outputWidth - renderedWidth) / 2 + normalizedX * maxShiftX
  const destinationY = (outputHeight - renderedHeight) / 2 + normalizedY * maxShiftY

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, destinationX, destinationY, renderedWidth, renderedHeight)
}

export const exportFinishPhoto = (
  canvas: HTMLCanvasElement,
  maxBytes = FINISH_PHOTO_MAX_BYTES,
): string => {
  for (let quality = 0.92; quality >= 0.1; quality -= 0.04) {
    const result = canvas.toDataURL(FINISH_PHOTO_MIME_TYPE, Number(quality.toFixed(2)))
    if (getDataUrlByteSize(result) <= maxBytes) return result
  }
  throw new Error('This photo could not be compressed below 100 KB. Try a simpler photo.')
}

export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, payload = ''] = dataUrl.split(',', 2)
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] ?? FINISH_PHOTO_MIME_TYPE
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}
