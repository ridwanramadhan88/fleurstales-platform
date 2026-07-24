import { describe, expect, it } from 'vitest'
import {
  createStoreLogoDataUrl,
  isSupportedStoreLogoValue,
  STORE_LOGO_MAX_BYTES,
  validateStoreLogoFile,
} from './storeLogoDomain'

describe('store logo domain', () => {
  it('accepts supported raster and SVG files', () => {
    expect(validateStoreLogoFile(new File(['x'], 'logo.png', { type: 'image/png' }))).toBeNull()
    expect(validateStoreLogoFile(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))).toBeNull()
  })

  it('rejects unsupported and oversized files', () => {
    expect(validateStoreLogoFile(new File(['x'], 'logo.gif', { type: 'image/gif' }))).toContain('PNG')
    expect(validateStoreLogoFile(new File([new Uint8Array(STORE_LOGO_MAX_BYTES + 1)], 'logo.png', { type: 'image/png' }))).toContain('1 MB')
  })

  it('rejects unsafe SVG content', async () => {
    const file = new File(['<svg><script>alert(1)</script></svg>'], 'logo.svg', { type: 'image/svg+xml' })
    await expect(createStoreLogoDataUrl(file)).rejects.toThrow('tidak didukung')
  })

  it('accepts uploaded data URLs and legacy remote URLs', () => {
    expect(isSupportedStoreLogoValue('data:image/png;base64,AA==')).toBe(true)
    expect(isSupportedStoreLogoValue('data:image/svg+xml;base64,PHN2Zy8+')).toBe(true)
    expect(isSupportedStoreLogoValue('https://example.com/logo.svg')).toBe(true)
    expect(isSupportedStoreLogoValue('javascript:alert(1)')).toBe(false)
  })
})
