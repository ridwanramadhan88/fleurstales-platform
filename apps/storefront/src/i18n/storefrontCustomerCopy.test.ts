import { describe, expect, it } from 'vitest'
import { translateUiText } from './translateUiText'

// Storefront-only customer copy (lives in the app-specific idTranslations.ts,
// so it cannot be asserted in the shared translateUiText.test.ts parity file).
describe('storefront customer copy (V2 batch 2)', () => {
  it('translates product gallery and quantity controls', () => {
    expect(translateUiText('Product gallery images', 'id')).toBe('Galeri gambar produk')
    expect(translateUiText('Previous product image', 'id')).toBe('Gambar produk sebelumnya')
    expect(translateUiText('Next product image', 'id')).toBe('Gambar produk berikutnya')
    expect(translateUiText('Product image unavailable', 'id')).toBe('Gambar produk tidak tersedia')
    expect(translateUiText('Decrease quantity', 'id')).toBe('Kurangi jumlah')
    expect(translateUiText('Increase quantity', 'id')).toBe('Tambah jumlah')
  })

  it('translates cart, checkout, and tracking copy', () => {
    expect(translateUiText('Your cart is empty', 'id')).toBe('Keranjangmu kosong')
    expect(translateUiText('Order received', 'id')).toBe('Pesanan diterima')
    expect(translateUiText('Thank you!', 'id')).toBe('Terima kasih!')
    expect(translateUiText('Total to pay', 'id')).toBe('Total dibayar')
    expect(translateUiText('Voucher applied', 'id')).toBe('Voucher diterapkan')
    expect(translateUiText('Apply', 'id')).toBe('Terapkan')
    expect(translateUiText('To confirm', 'id')).toBe('Akan dikonfirmasi')
  })

  it('translates browse, filter, and empty states', () => {
    expect(translateUiText('Browse flowers', 'id')).toBe('Lihat bunga')
    expect(translateUiText('Nothing here yet', 'id')).toBe('Belum ada di sini')
    expect(translateUiText('Product not found', 'id')).toBe('Produk tidak ditemukan')
    expect(translateUiText('Featured Products', 'id')).toBe('Produk Unggulan')
    expect(translateUiText('Shop filters', 'id')).toBe('Filter belanja')
    expect(translateUiText('Close cart', 'id')).toBe('Tutup keranjang')
  })
})
