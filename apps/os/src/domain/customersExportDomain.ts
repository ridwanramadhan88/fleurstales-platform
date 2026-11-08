/**
 * Pelanggan Excel export: one row per CRM profile with lifetime metrics,
 * optionally joined with review statistics.
 */
import type { EnrichedCustomer } from './customerDomain'
import type { StaffReview } from '../data/staffReviews'
import { tableSheet, wibDate, wibDateTime, type ExcelColumn } from '../lib/excelTableExport'
import type { WorksheetSpec } from '../lib/financePeriodXlsxExport'

const SEGMENT_ID: Record<string, string> = { vip: 'VIP', regular: 'Reguler', new: 'Baru' }
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** "Mei" for "1990-05-02"; empty for missing or malformed birthdays. */
export const birthdayMonth = (birthday?: string): string => {
  const match = birthday?.match(/^\d{4}-(\d{2})-\d{2}$/) ?? birthday?.match(/^(\d{2})-\d{2}$/)
  const month = match ? Number(match[1]) : NaN
  return month >= 1 && month <= 12 ? MONTHS[month - 1] : ''
}

export interface CustomersExportInput {
  customers: EnrichedCustomer[]
  /** Present only when the viewer may read reviews. */
  reviews?: StaffReview[]
  summary: { filterLabel: string; exportedBy: string; exportedAt: string }
}

export const buildCustomersExportSheets = (input: CustomersExportInput): WorksheetSpec[] => {
  const reviewsByCustomer = new Map<string, StaffReview[]>()
  for (const review of input.reviews ?? []) reviewsByCustomer.set(review.customerId, [...(reviewsByCustomer.get(review.customerId) ?? []), review])
  const reviewAverage = (id: string) => {
    const list = reviewsByCustomer.get(id) ?? []
    return list.length ? Math.round((list.reduce((sum, review) => sum + review.averageScore, 0) / list.length) * 100) / 100 : ''
  }

  const columns: ExcelColumn<EnrichedCustomer>[] = [
    { header: 'ID pelanggan', width: 16, value: (c) => c.profile.id },
    { header: 'Nama', width: 24, value: (c) => c.profile.name },
    { header: 'WhatsApp', width: 16, value: (c) => c.profile.whatsappNumber || c.profile.phone },
    { header: 'Email', width: 26, value: (c) => c.profile.email },
    { header: 'Ulang tahun', width: 12, value: (c) => c.profile.birthday },
    { header: 'Bulan ulang tahun', width: 12, value: (c) => birthdayMonth(c.profile.birthday) },
    { header: 'Cabang favorit', width: 13, value: (c) => c.profile.preferredBranch },
    { header: 'Segmen', width: 9, value: (c) => SEGMENT_ID[c.metrics.segment] ?? c.metrics.segment },
    { header: 'Pesanan selesai terverifikasi', kind: 'number', width: 13, value: (c) => c.metrics.orderCount },
    { header: 'Total belanja terverifikasi (Rp)', kind: 'money', width: 16, value: (c) => c.metrics.lifetimeSpend },
    { header: 'Rata-rata per pesanan (Rp)', kind: 'money', width: 15, value: (c) => c.metrics.averageOrderValue },
    { header: 'Pesanan terakhir', width: 17, value: (c) => wibDateTime(c.metrics.lastOrderDateLabel) },
    { header: 'Cabang paling sering', width: 13, value: (c) => c.metrics.mostUsedBranch },
    ...(input.reviews ? [
      { header: 'Jumlah ulasan', kind: 'number', width: 10, value: (c) => reviewsByCustomer.get(c.profile.id)?.length ?? 0 },
      { header: 'Rata-rata ulasan', kind: 'number', width: 10, value: (c) => reviewAverage(c.profile.id) },
    ] satisfies ExcelColumn<EnrichedCustomer>[] : []),
    { header: 'Tag', width: 18, value: (c) => c.profile.tags?.join(', ') },
    { header: 'Catatan', width: 30, value: (c) => c.profile.notes },
    { header: 'Kode promo', width: 12, value: (c) => c.profile.promoCode },
    { header: 'Daftar lewat', width: 10, value: (c) => (c.profile.createdSource === 'storefront' ? 'Website' : c.profile.createdSource === 'admin' ? 'Admin' : '') },
    { header: 'Pelanggan sejak', width: 12, value: (c) => wibDate(c.profile.createdAt) },
  ]

  const byBirthMonth = MONTHS.map((month) => ({ month, list: input.customers.filter((c) => birthdayMonth(c.profile.birthday) === month) }))
  type InfoRow = { label: string; value: string | number }
  const segmentCount = (segment: string) => input.customers.filter((c) => c.metrics.segment === segment).length

  return [
    tableSheet('Pelanggan', columns, input.customers),
    tableSheet<{ month: string; list: EnrichedCustomer[] }>('Ulang tahun per bulan', [
      { header: 'Bulan', width: 12, value: (r) => r.month },
      { header: 'Jumlah pelanggan', kind: 'number', width: 12, value: (r) => r.list.length },
      { header: 'Nama', width: 80, value: (r) => r.list.map((c) => c.profile.name).join(', ') },
    ], byBirthMonth),
    tableSheet<InfoRow>('Info', [
      { header: 'Keterangan', width: 24, value: (r) => r.label },
      { header: 'Nilai', width: 30, value: (r) => r.value },
    ], [
      { label: 'Filter', value: input.summary.filterLabel },
      { label: 'Jumlah pelanggan', value: input.customers.length },
      { label: 'VIP', value: segmentCount('vip') },
      { label: 'Reguler', value: segmentCount('regular') },
      { label: 'Baru', value: segmentCount('new') },
      { label: 'Diunduh oleh', value: input.summary.exportedBy },
      { label: 'Diunduh pada', value: wibDateTime(input.summary.exportedAt) },
    ]),
  ]
}
