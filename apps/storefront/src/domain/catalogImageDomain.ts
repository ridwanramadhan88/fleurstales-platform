import type { CatalogImageMimeType, CatalogProduct, CatalogProductImage } from '../store/catalogStoreTypes'

export const CATALOG_IMAGE_SIZE_PX = 800
export const CATALOG_IMAGE_MAX_BYTES = 100 * 1024
export const CATALOG_IMAGE_MAX_COUNT = 6
export const CATALOG_IMAGE_BUCKET = 'product-images'
export const CATALOG_IMAGE_MIME_TYPE: CatalogImageMimeType = 'image/jpeg'

export interface CatalogImageCrop {
  zoom: number
  offsetX: number
  offsetY: number
}

export interface PreparedCatalogImageUpload {
  imageId: string
  productId: string
  storagePath: string
  blob: Blob
  mimeType: CatalogImageMimeType
  byteSize: number
  width: number
  height: number
}

export const getDataUrlByteSize = (dataUrl: string): number => {
  const base64 = dataUrl.split(',')[1] ?? ''
  const padding = (base64.match(/=+$/)?.[0].length ?? 0)
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

const hashText = (value: string): string => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

const inferMimeType = (url: string): CatalogImageMimeType | undefined => {
  const normalized = url.toLowerCase()
  if (normalized.startsWith('data:image/jpeg') || /\.jpe?g(?:$|[?#])/.test(normalized)) return 'image/jpeg'
  if (normalized.startsWith('data:image/png') || /\.png(?:$|[?#])/.test(normalized)) return 'image/png'
  if (normalized.startsWith('data:image/webp') || /\.webp(?:$|[?#])/.test(normalized)) return 'image/webp'
  return undefined
}

const normalizedImage = (image: CatalogProductImage, index: number): CatalogProductImage => ({
  ...image,
  sortOrder: index,
  isPrimary: index === 0,
  mimeType: image.mimeType ?? inferMimeType(image.url),
})

/**
 * Returns one canonical image array while still understanding the pre-Phase-5
 * `thumbnail` and `gallery` aliases. The first image is always the primary one.
 */
export const normalizeCatalogProductImages = (
  product: Pick<CatalogProduct, 'images' | 'thumbnail' | 'gallery' | 'name'>,
): CatalogProductImage[] => {
  const canonical = (product.images ?? []).filter((image) => Boolean(image.url))
  if (canonical.length > 0) {
    const seen = new Set<string>()
    return [...canonical]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((image) => {
        if (seen.has(image.url)) return false
        seen.add(image.url)
        return true
      })
      .slice(0, CATALOG_IMAGE_MAX_COUNT)
      .map(normalizedImage)
  }

  const seen = new Set<string>()
  const urls = [product.thumbnail, ...(product.gallery ?? [])]
    .filter((url): url is string => Boolean(url))
    .filter((url) => {
      if (seen.has(url)) return false
      seen.add(url)
      return true
    })
    .slice(0, CATALOG_IMAGE_MAX_COUNT)

  return urls.map((url, index) => ({
    id: `legacy_img_${hashText(url)}_${index}`,
    url,
    altText: product.name,
    sortOrder: index,
    isPrimary: index === 0,
    mimeType: inferMimeType(url),
    ...(url.startsWith('data:image/jpeg') ? {
      byteSize: getDataUrlByteSize(url),
      width: CATALOG_IMAGE_SIZE_PX,
      height: CATALOG_IMAGE_SIZE_PX,
    } : {}),
  }))
}

export const getCatalogProductImageUrls = (
  product: Pick<CatalogProduct, 'images' | 'thumbnail' | 'gallery' | 'name'>,
): string[] => normalizeCatalogProductImages(product).map((image) => image.url)

export const getCatalogProductPrimaryImageUrl = (
  product: Pick<CatalogProduct, 'images' | 'thumbnail' | 'gallery' | 'name'>,
): string | undefined => normalizeCatalogProductImages(product)[0]?.url

export const getCatalogProductImageAliases = (
  images: CatalogProductImage[],
): Pick<CatalogProduct, 'thumbnail' | 'gallery'> => {
  const ordered = [...images].sort((a, b) => a.sortOrder - b.sortOrder)
  const primary = ordered.find((image) => image.isPrimary) ?? ordered[0]
  return {
    thumbnail: primary?.url,
    gallery: ordered.length > 0 ? ordered.map((image) => image.url) : undefined,
  }
}

export const createLocalCatalogProductImage = (params: {
  id: string
  url: string
  altText?: string
  sortOrder: number
  isPrimary?: boolean
}): CatalogProductImage => ({
  id: params.id,
  url: params.url,
  altText: params.altText,
  sortOrder: params.sortOrder,
  isPrimary: params.isPrimary ?? params.sortOrder === 0,
  mimeType: inferMimeType(params.url) ?? CATALOG_IMAGE_MIME_TYPE,
  ...(params.url.startsWith('data:image/jpeg') ? {
    byteSize: getDataUrlByteSize(params.url),
    width: CATALOG_IMAGE_SIZE_PX,
    height: CATALOG_IMAGE_SIZE_PX,
  } : {}),
})

const safeObjectSegment = (value: string): string => {
  const safe = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return safe || 'image'
}

export const buildCatalogImageStoragePath = (productId: string, imageId: string, contentVersion?: string): string =>
  `${safeObjectSegment(productId)}/${safeObjectSegment(imageId)}${contentVersion ? `-${safeObjectSegment(contentVersion)}` : ''}.jpg`

export const assignCatalogImageStoragePaths = (
  productId: string,
  images: CatalogProductImage[],
): CatalogProductImage[] => images.map((image) => ({
  ...image,
  ...(image.url.startsWith('data:image/')
    ? { storagePath: buildCatalogImageStoragePath(productId, image.id, hashText(image.url)) }
    : {}),
}))

export const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, payload = ''] = dataUrl.split(',', 2)
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] ?? CATALOG_IMAGE_MIME_TYPE
  const bytes = header.includes(';base64')
    ? Uint8Array.from(atob(payload), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload))
  return new Blob([bytes], { type: mimeType })
}

/**
 * Converts a locally edited JPEG into the exact payload the future Storage
 * adapter uploads. This is intentionally usable before a Supabase project exists.
 */
export const prepareCatalogImageUpload = (
  productId: string,
  image: CatalogProductImage,
): PreparedCatalogImageUpload | null => {
  if (!image.url.startsWith('data:image/')) return null
  const blob = dataUrlToBlob(image.url)
  if (blob.type !== CATALOG_IMAGE_MIME_TYPE) {
    throw new Error('Catalog product images must be JPEG before Storage upload.')
  }
  if (blob.size > CATALOG_IMAGE_MAX_BYTES) {
    throw new Error('Catalog product image exceeds the 100 KB Storage limit.')
  }
  return {
    imageId: image.id,
    productId,
    storagePath: image.storagePath ?? buildCatalogImageStoragePath(productId, image.id, hashText(image.url)),
    blob,
    mimeType: CATALOG_IMAGE_MIME_TYPE,
    byteSize: blob.size,
    width: image.width ?? CATALOG_IMAGE_SIZE_PX,
    height: image.height ?? CATALOG_IMAGE_SIZE_PX,
  }
}

export const drawCatalogImageCrop = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  crop: CatalogImageCrop,
): void => {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image editor is unavailable in this browser.')

  const outputSize = CATALOG_IMAGE_SIZE_PX
  canvas.width = outputSize
  canvas.height = outputSize

  context.clearRect(0, 0, outputSize, outputSize)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, outputSize, outputSize)

  const safeZoom = Math.min(3, Math.max(1, crop.zoom))
  const baseScale = Math.max(outputSize / image.naturalWidth, outputSize / image.naturalHeight)
  const scale = baseScale * safeZoom
  const renderedWidth = image.naturalWidth * scale
  const renderedHeight = image.naturalHeight * scale
  const maxShiftX = Math.max(0, (renderedWidth - outputSize) / 2)
  const maxShiftY = Math.max(0, (renderedHeight - outputSize) / 2)
  const normalizedX = Math.min(1, Math.max(-1, crop.offsetX))
  const normalizedY = Math.min(1, Math.max(-1, crop.offsetY))

  const destinationX = (outputSize - renderedWidth) / 2 + normalizedX * maxShiftX
  const destinationY = (outputSize - renderedHeight) / 2 + normalizedY * maxShiftY

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, destinationX, destinationY, renderedWidth, renderedHeight)
}

export const exportCatalogImage = (
  canvas: HTMLCanvasElement,
  maxBytes = CATALOG_IMAGE_MAX_BYTES,
): string => {
  for (let quality = 0.92; quality >= 0.1; quality -= 0.04) {
    const result = canvas.toDataURL(CATALOG_IMAGE_MIME_TYPE, Number(quality.toFixed(2)))
    if (getDataUrlByteSize(result) <= maxBytes) return result
  }

  throw new Error('This image could not be compressed below 100 KB. Try a simpler image.')
}
