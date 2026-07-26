import { describe, expect, it, vi } from 'vitest'
import {
  CATALOG_IMAGE_MAX_BYTES,
  CATALOG_IMAGE_SIZE_PX,
  assignCatalogImageStoragePaths,
  buildCatalogImageStoragePath,
  drawCatalogImageCrop,
  exportCatalogImage,
  getCatalogProductImageAliases,
  getDataUrlByteSize,
  normalizeCatalogProductImages,
  prepareCatalogImageUpload,
} from './catalogImageDomain'

describe('catalog image processing', () => {
  it('calculates decoded data URL size', () => {
    expect(getDataUrlByteSize('data:image/jpeg;base64,YWJjZA==')).toBe(4)
  })

  it('normalizes legacy thumbnail/gallery fields into one ordered canonical image set', () => {
    const images = normalizeCatalogProductImages({
      name: 'Rose Bouquet',
      thumbnail: 'https://example.com/main.jpg',
      gallery: ['https://example.com/main.jpg', 'https://example.com/detail.jpg'],
    })

    expect(images).toHaveLength(2)
    expect(images[0]?.isPrimary).toBe(true)
    expect(images[1]?.sortOrder).toBe(1)
    expect(getCatalogProductImageAliases(images)).toEqual({
      thumbnail: 'https://example.com/main.jpg',
      gallery: ['https://example.com/main.jpg', 'https://example.com/detail.jpg'],
    })
  })

  it('prepares a compressed local JPEG for its future Storage object path', () => {
    const url = 'data:image/jpeg;base64,YWJjZA=='
    const images = assignCatalogImageStoragePaths('catalog_product_1', [{
      id: 'img_1',
      url,
      sortOrder: 0,
      isPrimary: true,
      mimeType: 'image/jpeg',
    }])
    const upload = prepareCatalogImageUpload('catalog_product_1', images[0]!)

    expect(images[0]?.storagePath).toMatch(/^catalog_product_1\/img_1-[a-z0-9-]+\.jpg$/)
    expect(upload?.storagePath).toBe(images[0]?.storagePath)
    expect(images[0]?.storagePath).not.toBe(buildCatalogImageStoragePath('catalog_product_1', 'img_1'))
    expect(upload?.byteSize).toBe(4)
  })

  it('draws an 800x800 square crop', () => {
    const drawImage = vi.fn()
    const fillRect = vi.fn()
    const clearRect = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage,
        fillRect,
        clearRect,
        set fillStyle(_value: string) {},
        set imageSmoothingEnabled(_value: boolean) {},
        set imageSmoothingQuality(_value: string) {},
      }),
    } as unknown as HTMLCanvasElement
    const image = { naturalWidth: 1600, naturalHeight: 900 } as HTMLImageElement

    drawCatalogImageCrop(canvas, image, { zoom: 1, offsetX: 0, offsetY: 0 })

    expect(canvas.width).toBe(CATALOG_IMAGE_SIZE_PX)
    expect(canvas.height).toBe(CATALOG_IMAGE_SIZE_PX)
    expect(drawImage).toHaveBeenCalledOnce()
  })

  it('reduces JPEG quality until the result is no larger than 100 KB', () => {
    const oversized = `data:image/jpeg;base64,${'A'.repeat(150_000)}`
    const accepted = `data:image/jpeg;base64,${'A'.repeat(100_000)}`
    const toDataURL = vi.fn()
      .mockReturnValueOnce(oversized)
      .mockReturnValueOnce(accepted)
    const canvas = { toDataURL } as unknown as HTMLCanvasElement

    const result = exportCatalogImage(canvas)

    expect(getDataUrlByteSize(result)).toBeLessThanOrEqual(CATALOG_IMAGE_MAX_BYTES)
    expect(toDataURL).toHaveBeenCalledTimes(2)
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', expect.any(Number))
  })
})
