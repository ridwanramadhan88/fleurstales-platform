import { describe, expect, it } from 'vitest'
import { translateUiText } from './translateUiText'

describe('natural Indonesian UI copy', () => {
  it('translates common actions into concise Indonesian', () => {
    expect(translateUiText('Save', 'id')).toBe('Simpan')
    expect(translateUiText('Save changes', 'id')).toBe('Simpan perubahan')
    expect(translateUiText('Edit', 'id')).toBe('Ubah')
    expect(translateUiText('Create pending entry', 'id')).toBe('Buat entri yang menunggu verifikasi')
  })

  it('translates operational workflow states consistently', () => {
    expect(translateUiText('Confirmed', 'id')).toBe('Dikonfirmasi')
    expect(translateUiText('Rejected', 'id')).toBe('Ditolak')
    expect(translateUiText('Not assigned', 'id')).toBe('Belum ditugaskan')
    expect(translateUiText('Processing', 'id')).toBe('Diproses')
  })

  it('uses natural Indonesian instead of mixed-language sentences', () => {
    expect(translateUiText('Waiting for Finance confirmation.', 'id')).toBe('Menunggu konfirmasi dari tim Keuangan.')
    expect(translateUiText('Inventory is disabled.', 'id')).toBe('Fitur stok nonaktif.')
    expect(translateUiText('Finance rejected this order.', 'id')).toBe('Pesanan ini ditolak oleh tim Keuangan.')
    expect(translateUiText('Pilih Branch sebelum Create Order.', 'id')).toBe('Pilih cabang untuk membuat pesanan.')
    expect(translateUiText('Order di-Reject Finance.', 'id')).toBe('Pesanan ditolak oleh tim Keuangan.')
  })

  it('translates dynamic operational counts without English plural rules', () => {
    expect(translateUiText('Showing 3 of 8', 'id')).toBe('Menampilkan 3 dari 8')
    expect(translateUiText('4 results', 'id')).toBe('4 hasil')
    expect(translateUiText('2 to review', 'id')).toBe('2 perlu ditinjau')
    expect(translateUiText('1 item · 1 line', 'id')).toBe('1 item · 1 baris')
  })

  it('keeps established role and technical names', () => {
    expect(translateUiText('Owner', 'id')).toBe('Owner')
    expect(translateUiText('Admin', 'id')).toBe('Admin')
    expect(translateUiText('HR', 'id')).toBe('HR')
    expect(translateUiText('Florist', 'id')).toBe('Florist')
    expect(translateUiText('WhatsApp', 'id')).toBe('WhatsApp')
    expect(translateUiText('SKU', 'id')).toBe('SKU')
  })

  it('returns original English when selected', () => {
    expect(translateUiText('Inventory is disabled.', 'en')).toBe('Inventory is disabled.')
  })
})
