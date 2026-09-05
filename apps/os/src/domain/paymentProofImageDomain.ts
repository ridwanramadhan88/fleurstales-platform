/**
 * @file paymentProofImageDomain.ts
 * @description Bukti transfer (payment proof) upload for transfer orders.
 * Parallel to catalogImageDomain.ts but: no crop step, original aspect ratio
 * preserved (only downscaled if it exceeds the max long edge), and a lower
 * byte budget since these are read-only reference screenshots, not catalog
 * imagery.
 */

export const PAYMENT_PROOF_MAX_LONG_EDGE_PX = 1200
export const PAYMENT_PROOF_MAX_BYTES = 300 * 1024
export const PAYMENT_PROOF_BUCKET = 'order-payment-proofs'
export const PAYMENT_PROOF_MIME_TYPE = 'image/jpeg' as const

const safeObjectSegment = (value: string): string => {
  const safe = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || 'order'
}

export const buildPaymentProofStoragePath = (orderId: string): string => {
  const nonce = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${safeObjectSegment(orderId)}/proof-${nonce}.jpg`
}

export const getDataUrlByteSize = (dataUrl: string): number => {
  const base64 = dataUrl.split(',')[1] ?? ''
  const padding = base64.match(/=+$/)?.[0].length ?? 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, payload = ''] = dataUrl.split(',', 2)
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] ?? PAYMENT_PROOF_MIME_TYPE
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}

/**
 * Draws the source image at its original aspect ratio, downscaled only if it
 * exceeds PAYMENT_PROOF_MAX_LONG_EDGE_PX on its longer side. No cropping.
 */
export const drawPaymentProofImage = (canvas: HTMLCanvasElement, image: HTMLImageElement): void => {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image editor is unavailable in this browser.')

  const longEdge = Math.max(image.naturalWidth, image.naturalHeight)
  const scale = longEdge > PAYMENT_PROOF_MAX_LONG_EDGE_PX ? PAYMENT_PROOF_MAX_LONG_EDGE_PX / longEdge : 1
  const outputWidth = Math.max(1, Math.round(image.naturalWidth * scale))
  const outputHeight = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.width = outputWidth
  canvas.height = outputHeight

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, outputWidth, outputHeight)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, outputWidth, outputHeight)
}

export const exportPaymentProofImage = (
  canvas: HTMLCanvasElement,
  maxBytes = PAYMENT_PROOF_MAX_BYTES,
): string => {
  for (let quality = 0.92; quality >= 0.1; quality -= 0.04) {
    const result = canvas.toDataURL(PAYMENT_PROOF_MIME_TYPE, Number(quality.toFixed(2)))
    if (getDataUrlByteSize(result) <= maxBytes) return result
  }
  throw new Error('This screenshot could not be compressed below 300 KB. Try a simpler image.')
}

/**
 * Reads a source File, draws it at its resized-if-needed original aspect
 * ratio, and returns a compressed JPEG data URL no larger than
 * PAYMENT_PROOF_MAX_BYTES. No crop UI — this is the whole "upload" step.
 */
export const prepareUploadedPaymentProof = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file, try again.'))
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not read that file.'))
        return
      }
      const image = new Image()
      image.onerror = () => reject(new Error('Could not open that image.'))
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          drawPaymentProofImage(canvas, image)
          resolve(exportPaymentProofImage(canvas))
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Could not process that image.'))
        }
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
