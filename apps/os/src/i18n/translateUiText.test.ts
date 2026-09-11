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
    expect(translateUiText('Not assigned', 'id')).toBe('Belum Ditugaskan')
    expect(translateUiText('Processing', 'id')).toBe('Diproses')
  })

  it('uses Indonesian business terminology instead of mixed English labels', () => {
    expect(translateUiText('Dashboard', 'id')).toBe('Ringkasan')
    expect(translateUiText('Orders', 'id')).toBe('Pesanan')
    expect(translateUiText('Finance', 'id')).toBe('Keuangan')
    expect(translateUiText('Revenue', 'id')).toBe('Pendapatan')
    expect(translateUiText('Payroll', 'id')).toBe('Penggajian')
    expect(translateUiText('Inventory', 'id')).toBe('Inventaris')
    expect(translateUiText('Customer', 'id')).toBe('Pelanggan')
    expect(translateUiText('Branch', 'id')).toBe('Cabang')
  })

  it('uses natural Indonesian instead of mixed-language sentences', () => {
    expect(translateUiText('Waiting for Finance confirmation.', 'id')).toBe('Menunggu konfirmasi dari tim Keuangan.')
    expect(translateUiText('Inventory is disabled.', 'id')).toBe('Fitur stok nonaktif.')
    expect(translateUiText('Finance rejected this order.', 'id')).toBe('Pesanan ini ditolak oleh tim Keuangan.')
    expect(translateUiText('Pilih Branch sebelum Create Order.', 'id')).toBe('Pilih cabang untuk membuat pesanan.')
    expect(translateUiText('Order di-Reject Finance.', 'id')).toBe('Pesanan ditolak oleh tim Keuangan.')
  })

  it('polishes legacy-only copy through the canonical source', () => {
    expect(translateUiText('Employee warning review', 'id')).toBe('Peninjauan peringatan karyawan')
    expect(translateUiText('Delivery late', 'id')).toBe('Pengiriman terlambat')
    expect(translateUiText('Create a new staff account.', 'id')).toBe('Buat akun staf baru.')
    expect(translateUiText('Base salary is set per employee.', 'id')).toBe('Gaji pokok diatur per staf.')
    expect(translateUiText('Ready proposed. Waiting for Admin confirmation.', 'id')).toBe(
      'Status Siap telah diajukan. Menunggu konfirmasi Admin.',
    )
  })

  it('uses the reviewed source only as a polished lowest-priority fallback', () => {
    expect(translateUiText('Branch vs Branch', 'id')).toBe('Cabang vs Cabang')
    expect(translateUiText('Period vs Previous Period', 'id')).toBe('Periode vs Periode Sebelumnya')
    expect(translateUiText('Revenue vs Expense', 'id')).toBe('Pendapatan vs Pengeluaran')
    expect(translateUiText('Single view', 'id')).toBe('Tampilan tunggal')
  })

  it('translates dynamic operational copy without legacy English terms', () => {
    expect(translateUiText('Showing 3 of 8', 'id')).toBe('Menampilkan 3 dari 8')
    expect(translateUiText('4 results', 'id')).toBe('4 hasil')
    expect(translateUiText('2 to review', 'id')).toBe('2 perlu ditinjau')
    expect(translateUiText('1 item · 1 line', 'id')).toBe('1 item · 1 baris')
    expect(translateUiText('Review Attendance', 'id')).toBe('Tinjau Kehadiran')
    expect(translateUiText('Branch: Kedamaian', 'id')).toBe('Cabang: Kedamaian')
  })

  it('covers customer storefront and order tracking copy', () => {
    expect(translateUiText('You’ll get', 'id')).toBe('Kamu akan dapat')
    expect(translateUiText('All Flowers', 'id')).toBe('Semua Bunga')
    expect(translateUiText('Track your Fleurstales order', 'id')).toBe('Lacak pesanan Fleurstales Anda')
    expect(translateUiText('Customer & fulfillment', 'id')).toBe('Pelanggan & pemenuhan')
    expect(translateUiText('Open cart, 3 items', 'id')).toBe('Buka keranjang, 3 item')
  })

  it('preserves text-node boundary whitespace around translated copy', () => {
    expect(translateUiText('Save ', 'id')).toBe('Simpan ')
    expect(translateUiText(' Save changes', 'id')).toBe(' Simpan perubahan')
    expect(translateUiText('\tConfirmed\n', 'id')).toBe('\tDikonfirmasi\n')
    expect(`${translateUiText('Save ', 'id')}2026-09-03`).toBe('Simpan 2026-09-03')
    expect(translateUiText('   ', 'id')).toBe('   ')
  })

  it('translates staff-facing role names while preserving technical identifiers', () => {
    expect(translateUiText('Owner', 'id')).toBe('Pemilik')
    expect(translateUiText('Admin', 'id')).toBe('Admin')
    expect(translateUiText('HR', 'id')).toBe('SDM')
    expect(translateUiText('Florist', 'id')).toBe('Perangkai Bunga')
    expect(translateUiText('WhatsApp', 'id')).toBe('WhatsApp')
    expect(translateUiText('SKU', 'id')).toBe('SKU')
    expect(translateUiText('PDF', 'id')).toBe('PDF')
    expect(translateUiText('CSV', 'id')).toBe('CSV')
  })

  it('translates V2 audit batch 1 EXACT findings with the current contract', () => {
    expect(translateUiText('Future', 'id')).toBe('Mendatang')
    expect(translateUiText('Custom', 'id')).toBe('Kustom')
    expect(translateUiText('All', 'id')).toBe('Semua')
    expect(translateUiText('Assign Florists', 'id')).toBe('Tugaskan Perangkai Bunga')
    expect(translateUiText('Return to HR', 'id')).toBe('Kembalikan ke SDM')
    expect(translateUiText('Finance modules', 'id')).toBe('Modul Keuangan')
    expect(translateUiText('Customer reviews', 'id')).toBe('Ulasan pelanggan')
    expect(translateUiText('Review order', 'id')).toBe('Tinjau Pesanan')
    expect(translateUiText('Refund queue', 'id')).toBe('Antrian pengembalian dana')
    expect(translateUiText('Needs confirmation', 'id')).toBe('Perlu konfirmasi')
  })

  it('translates dashboard compare-period patterns', () => {
    expect(translateUiText('Revenue (confirmed) · Last 7 days', 'id')).toBe(
      'Pendapatan terkonfirmasi · Last 7 days',
    )
    expect(translateUiText('Revenue est. · Last 7 days', 'id')).toBe('Estimasi pendapatan · Last 7 days')
    expect(translateUiText('Orders confirmed · Last 7 days', 'id')).toBe('Pesanan terkonfirmasi · Last 7 days')
  })

  it('translates payroll modal titles while preserving staff names', () => {
    expect(translateUiText('Dewi payroll', 'id')).toBe('Penggajian Dewi')
    expect(translateUiText('Adjust Dewi', 'id')).toBe('Sesuaikan Dewi')
    expect(translateUiText('Resolve Dewi', 'id')).toBe('Selesaikan Dewi')
    expect(translateUiText('Final payroll', 'id')).toBe('Penggajian final')
  })

  it('translates refund and search dynamics while preserving business data', () => {
    expect(translateUiText('KDM-2026-0001 is now recorded as refunded.', 'id')).toBe(
      'KDM-2026-0001 kini tercatat sebagai dana dikembalikan.',
    )
    expect(translateUiText('KDM-2026-0001 returned to Paid.', 'id')).toBe('KDM-2026-0001 kembali ke Lunas.')
    expect(translateUiText('No customers match "Budi".', 'id')).toBe(
      'Tidak ada pelanggan yang cocok dengan "Budi".',
    )
  })

  it('translates refactored single-node dynamics while preserving variables', () => {
    expect(translateUiText('Showing 3 of 8 active orders.', 'id')).toBe('Menampilkan 3 dari 8 pesanan aktif.')
    expect(translateUiText('Showing 1 of 1 active order.', 'id')).toBe('Menampilkan 1 dari 1 pesanan aktif.')
    expect(translateUiText('2 decisions waiting for you.', 'id')).toBe('2 keputusan menunggu Anda.')
    expect(translateUiText('Availability for Today · 19:00', 'id')).toBe('Ketersediaan untuk Today · 19:00')
    expect(translateUiText('3 recommended · 5 active', 'id')).toBe('3 direkomendasikan · 5 aktif')
    expect(translateUiText('Approved points and estimated bonus for 2026-09.', 'id')).toBe(
      'Poin disetujui dan estimasi bonus untuk 2026-09.',
    )
    expect(translateUiText('Your shift ends at 18:00. Capture a new selfie to check out.', 'id')).toBe(
      'Shift berakhir 18:00. Ambil selfie baru untuk absen pulang.',
    )
    expect(translateUiText('After payment is confirmed, Process Order becomes available.', 'id')).toBe(
      'Setelah pembayaran dikonfirmasi, Process Order tersedia.',
    )
    expect(translateUiText('+5 points · order_reward', 'id')).toBe('+5 poin · order_reward')
    expect(translateUiText('HR reason: approved by manager on call', 'id')).toBe('Alasan SDM: approved by manager on call')
    expect(translateUiText('Value score 87/100', 'id')).toBe('Skor nilai 87/100')
    expect(translateUiText('Check-in 09:05', 'id')).toBe('Absen masuk 09:05')
    expect(translateUiText('Check-out 18:00', 'id')).toBe('Absen pulang 18:00')
    expect(translateUiText('Accepted within 100 m of this pin.', 'id')).toBe(
      'Dalam radius 100 m dari pin ini.',
    )
  })

  it('translates declarative-confirmation dialog copy while preserving business data', () => {
    expect(translateUiText('Remove type', 'id')).toBe('Hapus jenis')
    expect(translateUiText('Remove occasion', 'id')).toBe('Hapus momen')
    expect(translateUiText('Delete voucher?', 'id')).toBe('Hapus voucher?')
    expect(translateUiText('Delete stock items?', 'id')).toBe('Hapus item stok?')
    expect(translateUiText('Cancel order for Budi? This can be undone from the toast immediately after.', 'id')).toBe(
      'Batalkan pesanan Budi? Ini dapat diurungkan dari toast segera setelahnya.',
    )
    expect(translateUiText('Remove “Anniversary”?', 'id')).toBe('Hapus “Anniversary”?')
    expect(translateUiText('No active products use this occasion.', 'id')).toBe(
      'Tidak ada produk aktif yang memakai momen ini.',
    )
    expect(
      translateUiText(
        'No active products use this occasion. 2 inactive products will have this occasion removed. 1 whose main occasion is removed will move to Uncategorized.',
        'id',
      ),
    ).toBe(
      'Tidak ada produk aktif yang memakai momen ini. 2 produk nonaktif ikut kehilangan momen ini. 1 di antaranya pindah ke Tanpa kategori.',
    )
    expect(translateUiText('Delete voucher "BDAY20"? This cannot be undone.', 'id')).toBe(
      'Hapus voucher "BDAY20"? Ini tidak dapat dibatalkan.',
    )
    expect(translateUiText('Removed occasion “Anniversary”.', 'id')).toBe('Momen “Anniversary” dihapus.')
    expect(translateUiText('Delete 3 products? This cannot be undone.', 'id')).toBe(
      'Hapus 3 produk? Ini tidak dapat dibatalkan.',
    )
    expect(translateUiText('Delete 2 items? This cannot be undone.', 'id')).toBe(
      'Hapus 2 item? Ini tidak dapat dibatalkan.',
    )
  })

  it('returns original English when selected', () => {
    expect(translateUiText('Inventory is disabled.', 'en')).toBe('Inventory is disabled.')
    expect(translateUiText('Track your Fleurstales order', 'en')).toBe('Track your Fleurstales order')
  })
})
