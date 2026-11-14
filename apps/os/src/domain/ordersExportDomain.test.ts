import { describe, expect, it } from 'vitest'
import { buildOrdersExportSheets, filterOrdersForExport, ordersExportFilename } from './ordersExportDomain'
import type { OrderTableRow } from '../types/orders'
import type { CustomerProfile } from '../store/customerStoreTypes'
import type { StyledCell, WorkbookCell } from '../lib/financePeriodXlsxExport'

const value = (c: WorkbookCell) => (typeof c === 'object' && c !== null ? (c as StyledCell).value : c)

const order = (overrides: Partial<OrderTableRow>): OrderTableRow => ({
  orderNumber: 'FT-1', customerName: 'Sari', source: 'whatsapp', fulfillment: 'delivery', status: 'delivered',
  totalIdr: 350000, branch: 'Kedamaian', paymentStatus: 'paid', createdAtLabel: '1 Nov 2026', scheduleDate: '2026-11-01',
  ...overrides,
})

const sari: CustomerProfile = {
  id: 'cust-1', name: 'Sari', whatsappNumber: '0812111', normalizedWhatsappNumber: '62812111', email: 'sari@example.com',
  birthday: '1990-05-02', preferredBranch: 'Kedamaian', tags: ['Langganan'], notes: 'Suka mawar putih', createdAt: '2026-01-10T03:00:00Z',
}

const orders: OrderTableRow[] = [
  order({
    id: 'o1', orderNumber: 'FT-1', customerId: 'cust-1', scheduleTime: '10:00', paymentMethod: 'transfer', paymentChannel: 'qris',
    itemsSubtotalIdr: 330000, discountIdr: 10000, deliveryFeeIdr: 30000, promoCode: 'ULANG10', paidAmountIdr: 350000,
    financeVerified: true, financeVerifiedBy: 'Fina', deliveryAddress: 'Jl. Kenanga 1', greetingCardName: 'Budi', greetingMessage: 'Selamat ulang tahun',
    items: [
      { id: 'l1', productNameSnapshot: 'Buket Mawar', variantSizeSnapshot: 'M', quantity: 1, unitPriceIdr: 250000 },
      { id: 'l2', productName: 'Coklat', quantity: 2, unitPriceIdr: 40000 },
    ],
    paymentHistory: [{ id: 'p1', type: 'payment_received', amountIdr: 350000, previousPaidAmountIdr: 0, resultingPaidAmountIdr: 350000, resultingStatus: 'paid', method: 'transfer', reference: 'QR-77', actorName: 'Admin A', occurredAt: '2026-11-01T02:00:00Z', idempotencyKey: 'k1' }],
  }),
  order({ id: 'o2', orderNumber: 'FT-2', customerName: 'Tamu', status: 'cancelled', paymentStatus: 'unpaid', totalIdr: 200000, scheduleDate: '2026-11-03', branch: 'Pahoman', cancellationReason: 'Pelanggan batal' }),
  order({ id: 'o3', orderNumber: 'FT-3', status: 'processing', paymentStatus: 'partial', paidAmountIdr: 100000, totalIdr: 300000, scheduleDate: '2026-11-20', customerId: 'cust-1' }),
]

const build = (options: { fullOrder: boolean; fullCustomer: boolean }, list = orders) => buildOrdersExportSheets({
  orders: list, allOrders: orders, customers: [sari], options,
  lineItemName: (item) => item.productNameSnapshot ?? item.productName ?? 'Produk',
  orderProductName: (o) => o.productName ?? 'Produk',
  summary: { branchLabel: 'Semua cabang', rangeLabel: 'Semua tanggal', statusLabel: 'Semua status', exportedBy: 'Owner', exportedAt: '2026-11-08T02:00:00Z' },
})

describe('filterOrdersForExport', () => {
  it('filters by branch, delivery date range and status scope', () => {
    expect(filterOrdersForExport(orders, { branch: 'All', status: 'all' }).map((o) => o.orderNumber)).toEqual(['FT-1', 'FT-2', 'FT-3'])
    expect(filterOrdersForExport(orders, { branch: 'Kedamaian', status: 'all' }).map((o) => o.orderNumber)).toEqual(['FT-1', 'FT-3'])
    expect(filterOrdersForExport(orders, { branch: 'All', from: '2026-11-02', to: '2026-11-30', status: 'all' }).map((o) => o.orderNumber)).toEqual(['FT-2', 'FT-3'])
    expect(filterOrdersForExport(orders, { branch: 'All', status: 'finished' }).map((o) => o.orderNumber)).toEqual(['FT-1'])
    expect(filterOrdersForExport(orders, { branch: 'All', status: 'cancelled' }).map((o) => o.orderNumber)).toEqual(['FT-2'])
    expect(filterOrdersForExport(orders, { branch: 'All', status: 'active' }).map((o) => o.orderNumber)).toEqual(['FT-3'])
  })
})

describe('buildOrdersExportSheets', () => {
  it('basic export has Indonesian summary columns and an Info sheet', () => {
    const sheets = build({ fullOrder: false, fullCustomer: false })
    expect(sheets.map((s) => s.name)).toEqual(['Pesanan', 'Info'])
    const [head, first] = sheets[0].rows
    expect(head.map(value)).toEqual(['No. pesanan', 'Tanggal dibuat', 'Tanggal kirim/ambil', 'Jam', 'Cabang', 'Status', 'Antar/Ambil', 'Pelanggan', 'WhatsApp', 'Produk', 'Total (Rp)', 'Status bayar', 'Dibayar (Rp)', 'Sisa (Rp)'])
    expect(first.map(value)).toEqual(['FT-1', '1 Nov 2026', '2026-11-01', '10:00', 'Kedamaian', 'Terkirim', 'Antar', 'Sari', '0812111', 'Buket Mawar ×1; Coklat ×2', 350000, 'Lunas', 350000, 0])
    const partial = sheets[0].rows[3].map(value)
    expect(partial.slice(-3)).toEqual(['Bayar sebagian', 100000, 200000])
  })

  it('complete order data adds every order field plus Item and Pembayaran sheets', () => {
    const sheets = build({ fullOrder: true, fullCustomer: false })
    expect(sheets.map((s) => s.name)).toEqual(['Pesanan', 'Item', 'Pembayaran', 'Info'])
    const head = sheets[0].rows[0].map(value) as string[]
    const row = Object.fromEntries(head.map((h, i) => [h, value(sheets[0].rows[1][i])]))
    expect(row).toMatchObject({ 'Metode bayar': 'QRIS', 'Diskon (Rp)': 10000, 'Kode voucher': 'ULANG10', 'Ongkir (Rp)': 30000, 'Referensi bayar': 'QR-77', 'Verifikasi Keuangan': 'Terverifikasi', 'Alamat kirim': 'Jl. Kenanga 1', 'Nama di kartu': 'Budi', 'Pesan kartu ucapan': 'Selamat ulang tahun' })
    const cancelled = Object.fromEntries(head.map((h, i) => [h, value(sheets[0].rows[2][i])]))
    expect(cancelled['Alasan batal']).toBe('Pelanggan batal')
    expect(head).not.toContain('Email')
    expect(sheets[1].rows.length).toBe(1 + 4)
    expect(sheets[1].rows[2].map(value)).toContain(80000)
    expect(sheets[2].rows.slice(1).map((r) => value(r[0]))).toEqual(['FT-1'])
  })

  it('complete customer data adds CRM columns and one Pelanggan row per customer', () => {
    const sheets = build({ fullOrder: false, fullCustomer: true })
    expect(sheets.map((s) => s.name)).toEqual(['Pesanan', 'Pelanggan', 'Info'])
    const head = sheets[0].rows[0].map(value) as string[]
    const row = Object.fromEntries(head.map((h, i) => [h, value(sheets[0].rows[1][i])]))
    expect(row).toMatchObject({ 'ID pelanggan': 'cust-1', Email: 'sari@example.com', 'Ulang tahun': '1990-05-02', 'Tag pelanggan': 'Langganan', 'Catatan pelanggan': 'Suka mawar putih', 'Total belanja terverifikasi (Rp)': 350000 })
    const customers = sheets[1].rows.slice(1).map((r) => r.map(value))
    expect(customers.map((r) => r[1])).toEqual(['Sari', 'Tamu'])
    const customerHead = sheets[1].rows[0].map(value) as string[]
    expect(customers[0][customerHead.indexOf('Pesanan di file ini')]).toBe(2)
  })

  it('names the file by branch, range and contents', () => {
    expect(ordersExportFilename({ branch: 'Kedamaian', from: '2026-11-01', to: '2026-11-30', options: { fullOrder: true, fullCustomer: false } })).toBe('Pesanan_kedamaian_2026-11-01_sd_2026-11-30_lengkap.xlsx')
    expect(ordersExportFilename({ branch: 'All', options: { fullOrder: false, fullCustomer: false } })).toBe('Pesanan_semua-cabang_semua-tanggal.xlsx')
  })
})
