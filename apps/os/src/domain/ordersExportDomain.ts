/**
 * Pesanan Excel export: filtering and sheet layout.
 *
 * - Basic: one row per order with the columns staff use daily.
 * - "Data pesanan lengkap": every order field plus an "Item" sheet (one row
 *   per line item) and a "Pembayaran" sheet (payment history).
 * - "Data pelanggan lengkap": the CRM profile and lifetime metrics on every
 *   order row plus a "Pelanggan" sheet with each customer once.
 */
import type { OrderLineItem, OrderPaymentEvent, OrderStatus, OrderTableRow, PaymentStatus } from '../types/orders'
import type { CustomerProfile } from '../store/customerStoreTypes'
import type { CustomerSegmentRules } from '../store/customerStoreTypes'
import { buildEnrichedCustomers, getCustomerWhatsappNumber, type EnrichedCustomer } from './customerDomain'
import { parseOrderDateString } from './orderTimingDomain'
import { tableSheet, wibDate, wibDateTime, type ExcelColumn } from '../lib/excelTableExport'
import type { WorksheetSpec } from '../lib/financePeriodXlsxExport'

export type OrdersExportStatusScope = 'all' | 'active' | 'finished' | 'cancelled'

export interface OrdersExportOptions {
  fullOrder: boolean
  fullCustomer: boolean
}

export const ORDER_STATUS_ID: Record<OrderStatus, string> = {
  pending_verification: 'Menunggu konfirmasi',
  confirmed: 'Dikonfirmasi',
  processing: 'Diproses',
  ready: 'Siap',
  delivering: 'Dalam pengiriman',
  delivered: 'Terkirim',
  picked_up: 'Sudah diambil',
  cancelled: 'Dibatalkan',
  failed: 'Gagal',
}

export const PAYMENT_STATUS_ID: Record<PaymentStatus, string> = {
  unpaid: 'Belum bayar',
  partial: 'Bayar sebagian',
  paid: 'Lunas',
  refund_pending: 'Refund diproses',
  refunded: 'Sudah direfund',
}

const PAYMENT_EVENT_ID: Record<OrderPaymentEvent['type'], string> = {
  payment_received: 'Pembayaran diterima',
  payment_reversed: 'Pembayaran dibatalkan',
  payment_status_adjusted: 'Status bayar disesuaikan',
  refund_initiated: 'Refund dimulai',
  refund_completed: 'Refund selesai',
  refund_cancelled: 'Refund dibatalkan',
}

const SOURCE_ID: Record<OrderTableRow['source'], string> = { whatsapp: 'WhatsApp', walk_in: 'Datang langsung', customer_app: 'Website' }
const SEGMENT_ID: Record<string, string> = { vip: 'VIP', regular: 'Reguler', new: 'Baru' }

const FINISHED: OrderStatus[] = ['delivered', 'picked_up']
const CANCELLED: OrderStatus[] = ['cancelled', 'failed']

export const matchesStatusScope = (order: OrderTableRow, scope: OrdersExportStatusScope): boolean => {
  if (scope === 'all') return true
  if (scope === 'finished') return FINISHED.includes(order.status)
  if (scope === 'cancelled') return CANCELLED.includes(order.status)
  return !FINISHED.includes(order.status) && !CANCELLED.includes(order.status)
}

/** Filters by branch, delivery/pickup date (YYYY-MM-DD, inclusive) and status. */
export const filterOrdersForExport = (orders: OrderTableRow[], input: {
  branch: string
  from?: string
  to?: string
  status: OrdersExportStatusScope
}): OrderTableRow[] => orders
  .filter((order) => input.branch === 'All' || order.branch === input.branch)
  .filter((order) => {
    if (!input.from && !input.to) return true
    const date = parseOrderDateString(order)
    if (!date) return false
    if (input.from && date < input.from) return false
    if (input.to && date > input.to) return false
    return true
  })
  .filter((order) => matchesStatusScope(order, input.status))
  .sort((a, b) => `${parseOrderDateString(a) ?? ''} ${a.scheduleTime ?? ''} ${a.orderNumber}`
    .localeCompare(`${parseOrderDateString(b) ?? ''} ${b.scheduleTime ?? ''} ${b.orderNumber}`))

export const paymentMethodLabel = (order: OrderTableRow): string => {
  if (order.paymentChannel === 'qris') return 'QRIS'
  if (order.paymentMethod === 'cash') return 'Tunai'
  if (order.paymentMethod === 'transfer') return 'Transfer'
  return ''
}

const financeVerificationLabel = (order: OrderTableRow): string => {
  if (order.financeVerified) return 'Terverifikasi'
  if (order.financeVerificationStatus === 'rejected') return 'Ditolak'
  if (order.financeVerificationStatus === 'review') return 'Ditinjau'
  return 'Belum'
}

const refundStatusLabel = (order: OrderTableRow): string => {
  if (order.paymentStatus === 'refunded') return 'Selesai'
  if (order.paymentStatus === 'refund_pending') return 'Diproses'
  if (order.refundCancelledAt) return 'Dibatalkan'
  return ''
}

const orderLines = (order: OrderTableRow, fallbackName: string): OrderLineItem[] => order.items?.length
  ? order.items
  : [{ id: 'legacy', productId: order.productId, productName: fallbackName, quantity: 1, unitPriceIdr: order.itemsSubtotalIdr ?? order.totalIdr }]

export interface OrdersExportInput {
  orders: OrderTableRow[]
  /** Every order the viewer may see; used for customer lifetime metrics. */
  allOrders: OrderTableRow[]
  customers: CustomerProfile[]
  segmentRules?: CustomerSegmentRules
  options: OrdersExportOptions
  /** Display name of a line item (catalog name, snapshot or custom name). */
  lineItemName: (item: OrderLineItem, order: OrderTableRow) => string
  /** Display name of a legacy single-product order without items. */
  orderProductName: (order: OrderTableRow) => string
  summary: { branchLabel: string; rangeLabel: string; statusLabel: string; exportedBy: string; exportedAt: string }
}

interface OrderRow {
  order: OrderTableRow
  lines: OrderLineItem[]
  customer?: EnrichedCustomer
}

const findCustomer = (order: OrderTableRow, byId: Map<string, EnrichedCustomer>, byName: Map<string, EnrichedCustomer>) =>
  (order.customerId ? byId.get(order.customerId) : undefined) ?? (!order.customerId ? byName.get(order.customerName) : undefined)

export const buildOrdersExportSheets = (input: OrdersExportInput): WorksheetSpec[] => {
  const enriched = buildEnrichedCustomers(input.customers, input.allOrders, input.segmentRules)
  const byId = new Map(enriched.map((entry) => [entry.profile.id, entry]))
  const byName = new Map(enriched.map((entry) => [entry.profile.name, entry]))
  const rows: OrderRow[] = input.orders.map((order) => ({
    order,
    lines: orderLines(order, input.orderProductName(order)),
    customer: findCustomer(order, byId, byName),
  }))

  const whatsapp = (row: OrderRow) => getCustomerWhatsappNumber(row.customer?.profile ?? (row.order.customerSnapshot ? {
    ...row.order.customerSnapshot,
    whatsappNumber: row.order.customerSnapshot.whatsappNumber ?? row.order.customerSnapshot.phone ?? '',
  } : undefined))
  const paid = (order: OrderTableRow) => Math.max(0, order.paidAmountIdr ?? (order.paymentStatus === 'paid' ? order.totalIdr : 0))

  const basic: ExcelColumn<OrderRow>[] = [
    { header: 'No. pesanan', width: 16, value: (r) => r.order.orderNumber },
    { header: 'Tanggal dibuat', width: 17, value: (r) => r.order.createdAt ? wibDateTime(r.order.createdAt) : r.order.createdAtLabel },
    { header: 'Tanggal kirim/ambil', width: 13, value: (r) => parseOrderDateString(r.order) },
    { header: 'Jam', width: 7, value: (r) => r.order.scheduleTime?.slice(0, 5) },
    { header: 'Cabang', width: 12, value: (r) => r.order.branch },
    { header: 'Status', width: 18, value: (r) => ORDER_STATUS_ID[r.order.status] ?? r.order.status },
    { header: 'Antar/Ambil', width: 10, value: (r) => (r.order.fulfillment === 'delivery' ? 'Antar' : 'Ambil') },
    { header: 'Pelanggan', width: 22, value: (r) => r.order.customerName },
    { header: 'WhatsApp', width: 16, value: whatsapp },
    { header: 'Produk', width: 40, value: (r) => r.lines.map((line) => `${input.lineItemName(line, r.order)} ×${line.quantity}`).join('; ') },
    { header: 'Total (Rp)', kind: 'money', value: (r) => r.order.totalIdr },
    { header: 'Status bayar', width: 15, value: (r) => PAYMENT_STATUS_ID[r.order.paymentStatus] ?? r.order.paymentStatus },
    { header: 'Dibayar (Rp)', kind: 'money', value: (r) => paid(r.order) },
    { header: 'Sisa (Rp)', kind: 'money', value: (r) => Math.max(0, r.order.totalIdr - paid(r.order)) },
  ]

  const fullOrder: ExcelColumn<OrderRow>[] = [
    { header: 'Sumber', width: 14, value: (r) => SOURCE_ID[r.order.source] ?? r.order.source },
    { header: 'Jumlah item', kind: 'number', width: 10, value: (r) => r.lines.reduce((sum, line) => sum + line.quantity, 0) },
    { header: 'Subtotal item (Rp)', kind: 'money', value: (r) => r.order.itemsSubtotalIdr ?? r.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceIdr, 0) },
    { header: 'Diskon (Rp)', kind: 'money', value: (r) => r.order.discountIdr ?? 0 },
    { header: 'Kode voucher', width: 14, value: (r) => r.order.promoCode },
    { header: 'Ongkir (Rp)', kind: 'money', value: (r) => r.order.deliveryFeeIdr ?? 0 },
    { header: 'Metode bayar', width: 11, value: (r) => paymentMethodLabel(r.order) },
    { header: 'Referensi bayar', width: 20, value: (r) => r.order.paymentHistory?.map((event) => event.reference).filter(Boolean).join('; ') },
    { header: 'Kode referensi Finance', width: 18, value: (r) => r.order.financeReferenceCode },
    { header: 'Verifikasi Finance', width: 14, value: (r) => financeVerificationLabel(r.order) },
    { header: 'Diverifikasi oleh', width: 16, value: (r) => r.order.financeVerifiedBy ?? r.order.financeVerificationActor },
    { header: 'Diverifikasi pada', width: 17, value: (r) => wibDateTime(r.order.financeVerifiedAt ?? r.order.financeVerificationAt) },
    { header: 'Catatan verifikasi', width: 24, value: (r) => r.order.financeVerificationNote },
    { header: 'Admin', width: 16, value: (r) => r.order.adminHandledByName },
    { header: 'Florist', width: 16, value: (r) => r.order.florist },
    { header: 'Florist ditugaskan pada', width: 17, value: (r) => wibDateTime(r.order.floristAssignedAt) },
    { header: 'Alamat kirim', width: 36, value: (r) => r.order.deliveryAddress },
    { header: 'Instruksi kirim', width: 24, value: (r) => r.order.deliveryInstructions },
    { header: 'Catatan pesanan', width: 28, value: (r) => r.order.orderNote },
    { header: 'Catatan internal', width: 28, value: (r) => r.order.internalNote },
    { header: 'Nama di kartu', width: 18, value: (r) => r.order.greetingCardName },
    { header: 'Pesan kartu ucapan', width: 36, value: (r) => r.order.greetingMessage ?? r.order.giftMessage },
    { header: 'Mulai diproses', width: 17, value: (r) => wibDateTime(r.order.processingStartedAt) },
    { header: 'Selesai pada', width: 17, value: (r) => wibDateTime(r.order.completedAt) },
    { header: 'Diambil pada', width: 17, value: (r) => wibDateTime(r.order.actualPickedUpAt) },
    { header: 'Alasan batal', width: 24, value: (r) => r.order.cancellationReason },
    { header: 'Dibatalkan oleh', width: 16, value: (r) => r.order.cancelledBy },
    { header: 'Dibatalkan pada', width: 17, value: (r) => wibDateTime(r.order.cancelledAt) },
    { header: 'Refund (Rp)', kind: 'money', value: (r) => r.order.refundAmountIdr },
    { header: 'Status refund', width: 12, value: (r) => refundStatusLabel(r.order) },
    { header: 'Alasan refund', width: 24, value: (r) => r.order.refundReason },
    { header: 'Refund selesai pada', width: 17, value: (r) => wibDateTime(r.order.refundCompletedAt) },
    { header: 'Foto hasil', width: 30, value: (r) => r.order.finishPhotoUrl },
    { header: 'Bukti bayar', width: 30, value: (r) => r.order.paymentProofUrl },
    { header: 'Diperbarui', width: 17, value: (r) => wibDateTime(r.order.updatedAt) },
  ]

  const fullCustomer: ExcelColumn<OrderRow>[] = [
    { header: 'ID pelanggan', width: 16, value: (r) => r.customer?.profile.id ?? r.order.customerId },
    { header: 'Email', width: 24, value: (r) => r.customer?.profile.email ?? r.order.customerSnapshot?.email },
    { header: 'Ulang tahun', width: 12, value: (r) => r.customer?.profile.birthday },
    { header: 'Cabang favorit', width: 13, value: (r) => r.customer?.profile.preferredBranch },
    { header: 'Segmen', width: 9, value: (r) => (r.customer ? SEGMENT_ID[r.customer.metrics.segment] ?? r.customer.metrics.segment : '') },
    { header: 'Pesanan selesai terverifikasi', kind: 'number', width: 12, value: (r) => r.customer?.metrics.orderCount },
    { header: 'Total belanja terverifikasi (Rp)', kind: 'money', width: 15, value: (r) => r.customer?.metrics.lifetimeSpend },
    { header: 'Tag pelanggan', width: 18, value: (r) => r.customer?.profile.tags?.join(', ') },
    { header: 'Catatan pelanggan', width: 28, value: (r) => r.customer?.profile.notes },
    { header: 'Pelanggan sejak', width: 12, value: (r) => wibDate(r.customer?.profile.createdAt) },
  ]

  const orderColumns = [
    ...basic,
    ...(input.options.fullOrder ? fullOrder : []),
    ...(input.options.fullCustomer ? fullCustomer : []),
  ]
  const sheets: WorksheetSpec[] = [tableSheet('Pesanan', orderColumns, rows)]

  if (input.options.fullOrder) {
    type LineRow = { order: OrderTableRow; line: OrderLineItem }
    const lineRows: LineRow[] = rows.flatMap((row) => row.lines.map((line) => ({ order: row.order, line })))
    sheets.push(tableSheet<LineRow>('Item', [
      { header: 'No. pesanan', width: 16, value: (r) => r.order.orderNumber },
      { header: 'Tanggal kirim/ambil', width: 13, value: (r) => parseOrderDateString(r.order) },
      { header: 'Cabang', width: 12, value: (r) => r.order.branch },
      { header: 'Status', width: 18, value: (r) => ORDER_STATUS_ID[r.order.status] ?? r.order.status },
      { header: 'Kode produk', width: 12, value: (r) => r.line.productCodeSnapshot },
      { header: 'Produk', width: 30, value: (r) => input.lineItemName(r.line, r.order) },
      { header: 'Ukuran/varian', width: 14, value: (r) => r.line.variantSizeSnapshot },
      { header: 'SKU', width: 14, value: (r) => r.line.variantSkuSnapshot },
      { header: 'Qty', kind: 'number', width: 6, value: (r) => r.line.quantity },
      { header: 'Harga satuan (Rp)', kind: 'money', value: (r) => r.line.unitPriceIdr },
      { header: 'Subtotal (Rp)', kind: 'money', value: (r) => r.line.unitPriceIdr * r.line.quantity },
      { header: 'Resep bunga', width: 40, value: (r) => r.line.flowerRecipeSnapshot?.map((flower) => `${flower.flowerName} ${flower.quantity} ${flower.unit === 'bunch' ? 'ikat' : 'tangkai'}`).join('; ') },
    ], lineRows))

    type PaymentRow = { order: OrderTableRow; event: OrderPaymentEvent }
    const paymentRows: PaymentRow[] = rows
      .flatMap((row) => (row.order.paymentHistory ?? []).map((event) => ({ order: row.order, event })))
      .sort((a, b) => a.event.occurredAt.localeCompare(b.event.occurredAt))
    sheets.push(tableSheet<PaymentRow>('Pembayaran', [
      { header: 'No. pesanan', width: 16, value: (r) => r.order.orderNumber },
      { header: 'Waktu', width: 17, value: (r) => wibDateTime(r.event.occurredAt) },
      { header: 'Jenis', width: 22, value: (r) => PAYMENT_EVENT_ID[r.event.type] ?? r.event.type },
      { header: 'Nominal (Rp)', kind: 'money', value: (r) => r.event.amountIdr },
      { header: 'Metode', width: 10, value: (r) => (r.event.method === 'cash' ? 'Tunai' : r.event.method === 'transfer' ? (r.order.paymentChannel === 'qris' ? 'QRIS' : 'Transfer') : '') },
      { header: 'Referensi', width: 20, value: (r) => r.event.reference },
      { header: 'Total dibayar setelahnya (Rp)', kind: 'money', width: 16, value: (r) => r.event.resultingPaidAmountIdr },
      { header: 'Status bayar setelahnya', width: 16, value: (r) => PAYMENT_STATUS_ID[r.event.resultingStatus] ?? r.event.resultingStatus },
      { header: 'Oleh', width: 16, value: (r) => r.event.actorName },
      { header: 'Catatan', width: 28, value: (r) => r.event.note },
    ], paymentRows))
  }

  if (input.options.fullCustomer) {
    type CustomerRow = { customer?: EnrichedCustomer; name: string; whatsapp: string; email?: string; orders: OrderTableRow[] }
    const grouped = new Map<string, CustomerRow>()
    for (const row of rows) {
      const key = row.customer?.profile.id ?? row.order.customerId ?? `name:${row.order.customerName}`
      const existing = grouped.get(key)
      if (existing) existing.orders.push(row.order)
      else grouped.set(key, { customer: row.customer, name: row.customer?.profile.name ?? row.order.customerName, whatsapp: whatsapp(row), email: row.customer?.profile.email ?? row.order.customerSnapshot?.email, orders: [row.order] })
    }
    const customerRows = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'id'))
    sheets.push(tableSheet<CustomerRow>('Pelanggan', [
      { header: 'ID pelanggan', width: 16, value: (r) => r.customer?.profile.id ?? r.orders[0]?.customerId },
      { header: 'Nama', width: 22, value: (r) => r.name },
      { header: 'WhatsApp', width: 16, value: (r) => r.whatsapp },
      { header: 'Email', width: 24, value: (r) => r.email },
      { header: 'Ulang tahun', width: 12, value: (r) => r.customer?.profile.birthday },
      { header: 'Cabang favorit', width: 13, value: (r) => r.customer?.profile.preferredBranch },
      { header: 'Segmen', width: 9, value: (r) => (r.customer ? SEGMENT_ID[r.customer.metrics.segment] ?? r.customer.metrics.segment : '') },
      { header: 'Pesanan selesai terverifikasi', kind: 'number', width: 12, value: (r) => r.customer?.metrics.orderCount },
      { header: 'Total belanja terverifikasi (Rp)', kind: 'money', width: 15, value: (r) => r.customer?.metrics.lifetimeSpend },
      { header: 'Rata-rata per pesanan (Rp)', kind: 'money', width: 15, value: (r) => r.customer?.metrics.averageOrderValue },
      { header: 'Pesanan terakhir', width: 16, value: (r) => wibDateTime(r.customer?.metrics.lastOrderDateLabel) },
      { header: 'Cabang paling sering', width: 13, value: (r) => r.customer?.metrics.mostUsedBranch },
      { header: 'Pesanan di file ini', kind: 'number', width: 11, value: (r) => r.orders.length },
      { header: 'Nilai pesanan di file ini (Rp)', kind: 'money', width: 16, value: (r) => r.orders.reduce((sum, order) => sum + order.totalIdr, 0) },
      { header: 'Tag', width: 18, value: (r) => r.customer?.profile.tags?.join(', ') },
      { header: 'Catatan', width: 28, value: (r) => r.customer?.profile.notes },
      { header: 'Kode promo', width: 12, value: (r) => r.customer?.profile.promoCode },
      { header: 'Daftar lewat', width: 10, value: (r) => (r.customer?.profile.createdSource === 'storefront' ? 'Website' : r.customer?.profile.createdSource === 'admin' ? 'Admin' : '') },
      { header: 'Pelanggan sejak', width: 12, value: (r) => wibDate(r.customer?.profile.createdAt) },
    ], customerRows))
  }

  const totals = rows.reduce((sum, row) => ({ value: sum.value + row.order.totalIdr, paid: sum.paid + paid(row.order) }), { value: 0, paid: 0 })
  type InfoRow = { label: string; value: string | number; kind?: 'money' }
  sheets.push(tableSheet<InfoRow>('Info', [
    { header: 'Keterangan', width: 24, value: (r) => r.label },
    { header: 'Nilai', width: 30, value: (r) => r.value },
  ], [
    { label: 'Cabang', value: input.summary.branchLabel },
    { label: 'Tanggal kirim/ambil', value: input.summary.rangeLabel },
    { label: 'Status', value: input.summary.statusLabel },
    { label: 'Jumlah pesanan', value: rows.length },
    { label: 'Total nilai pesanan (Rp)', value: totals.value },
    { label: 'Total dibayar (Rp)', value: totals.paid },
    { label: 'Isi', value: ['Ringkas', input.options.fullOrder ? 'data pesanan lengkap' : '', input.options.fullCustomer ? 'data pelanggan lengkap' : ''].filter(Boolean).join(' + ') },
    { label: 'Diunduh oleh', value: input.summary.exportedBy },
    { label: 'Diunduh pada', value: wibDateTime(input.summary.exportedAt) },
  ]))
  return sheets
}

export const ordersExportFilename = (input: { branch: string; from?: string; to?: string; options: OrdersExportOptions }): string => {
  const range = input.from || input.to ? `${input.from ?? 'awal'}_sd_${input.to ?? 'akhir'}` : 'semua-tanggal'
  const branch = input.branch === 'All' ? 'semua-cabang' : input.branch.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const suffix = input.options.fullOrder || input.options.fullCustomer ? '_lengkap' : ''
  return `Pesanan_${branch}_${range}${suffix}.xlsx`
}
