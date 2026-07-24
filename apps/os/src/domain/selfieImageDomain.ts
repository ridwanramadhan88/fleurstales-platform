const MAX_SELFIE_BYTES = 100 * 1024
const DEFAULT_SELFIE_SIZE = 720

export const estimateDataUrlBytes = (dataUrl: string): number => {
  const base64 = dataUrl.split(',')[1] ?? ''
  return Math.ceil((base64.length * 3) / 4)
}

const loadImage = (source: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = () => reject(new Error('The selected image could not be read.'))
  image.src = source
})

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = () => reject(new Error('The selected image could not be read.'))
  reader.readAsDataURL(file)
})

/** Crops the center square and compresses to JPEG at or below 100 KB. */
export const compressSelfieToSquareJpeg = async (
  input: File | string,
  maxBytes = MAX_SELFIE_BYTES,
): Promise<string> => {
  const source = typeof input === 'string' ? input : await fileToDataUrl(input)
  const image = await loadImage(source)
  const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height)
  if (!sourceSize) throw new Error('The selected image has invalid dimensions.')

  let outputSize = Math.min(DEFAULT_SELFIE_SIZE, sourceSize)
  const sourceX = ((image.naturalWidth || image.width) - sourceSize) / 2
  const sourceY = ((image.naturalHeight || image.height) - sourceSize) / 2

  while (outputSize >= 240) {
    const canvas = document.createElement('canvas')
    canvas.width = outputSize
    canvas.height = outputSize
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image compression is unavailable in this browser.')
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, outputSize, outputSize)

    for (let quality = 0.86; quality >= 0.3; quality -= 0.08) {
      const result = canvas.toDataURL('image/jpeg', quality)
      if (estimateDataUrlBytes(result) <= maxBytes) return result
    }
    outputSize = Math.floor(outputSize * 0.8)
  }

  throw new Error('The selfie could not be compressed below 100 KB. Try a simpler or lower-resolution photo.')
}
