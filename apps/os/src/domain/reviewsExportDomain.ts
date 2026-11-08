/**
 * Ulasan pelanggan Excel export. Review rows come from `get_staff_reviews`;
 * branch, product and florist are joined from the order the review belongs to.
 */
import type { StaffReview } from '../data/staffReviews'
import type { OrderTableRow } from '../types/orders'
import { parseOrderDateString } from './orderTimingDomain'
import { tableSheet, wibDate, wibDateTime, type ExcelColumn } from '../lib/excelTableExport'
import type { WorksheetSpec } from '../lib/financePeriodXlsxExport'

export interface ReviewsExportInput {
  reviews: StaffReview[]
  orders: OrderTableRow[]
  orderProducts: (order: OrderTableRow) => string
  summary: { rangeLabel: string; exportedBy: string; exportedAt: string }
}

/** Filters by WIB submission date (YYYY-MM-DD, inclusive). */
export const filterReviewsForExport = (reviews: StaffReview[], input: { from?: string; to?: string }): StaffReview[] => reviews
  .filter((review) => {
    const day = wibDate(review.submittedAt)
    if (input.from && day < input.from) return false
    if (input.to && day > input.to) return false
    return true
  })
  .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))

const round2 = (value: number) => Math.round(value * 100) / 100

const rewardLabel = (review: StaffReview): string => {
  const reward = review.reward
  if (!reward) return ''
  if (reward.amountOffIdr) return `Potongan Rp${reward.amountOffIdr.toLocaleString('id-ID')}`
  if (reward.percentOff) return `Diskon ${reward.percentOff}%`
  return 'Voucher'
}

export const buildReviewsExportSheets = (input: ReviewsExportInput): WorksheetSpec[] => {
  const ordersById = new Map(input.orders.filter((order) => order.id).map((order) => [order.id as string, order]))
  const ordersByNumber = new Map(input.orders.map((order) => [order.orderNumber, order]))
  type Row = { review: StaffReview; order?: OrderTableRow }
  const rows: Row[] = input.reviews.map((review) => ({ review, order: ordersById.get(review.orderId) ?? ordersByNumber.get(review.orderNumber) }))

  // One column per question, in first-seen order (question text is a snapshot).
  const questions: string[] = []
  for (const review of input.reviews) {
    for (const answer of review.answers) if (!questions.includes(answer.question)) questions.push(answer.question)
  }
  const score = (review: StaffReview, question: string) => review.answers.find((answer) => answer.question === question)?.score

  const columns: ExcelColumn<Row>[] = [
    { header: 'Tanggal ulasan', width: 17, value: (r) => wibDateTime(r.review.submittedAt) },
    { header: 'No. pesanan', width: 16, value: (r) => r.review.orderNumber },
    { header: 'Cabang', width: 12, value: (r) => r.order?.branch },
    { header: 'Tanggal kirim/ambil', width: 13, value: (r) => (r.order ? parseOrderDateString(r.order) : '') },
    { header: 'Produk', width: 32, value: (r) => (r.order ? input.orderProducts(r.order) : '') },
    { header: 'Florist', width: 16, value: (r) => r.order?.florist },
    { header: 'Admin', width: 16, value: (r) => r.order?.adminHandledByName },
    { header: 'Pelanggan', width: 22, value: (r) => r.review.customerName ?? r.order?.customerName },
    { header: 'WhatsApp', width: 16, value: (r) => r.review.customerWhatsapp ?? r.order?.customerSnapshot?.whatsappNumber },
    { header: 'Rata-rata', kind: 'number', width: 9, value: (r) => round2(r.review.averageScore) },
    ...questions.map((question): ExcelColumn<Row> => ({ header: question, kind: 'number', width: Math.min(28, Math.max(12, question.length)), value: (r) => score(r.review, question) })),
    { header: 'Catatan pelanggan', width: 40, value: (r) => r.review.note },
    { header: 'Hadiah', width: 18, value: (r) => rewardLabel(r.review) },
    { header: 'Status hadiah', width: 13, value: (r) => (r.review.reward ? (r.review.reward.status === 'redeemed' ? 'Sudah dipakai' : 'Belum dipakai') : '') },
    { header: 'Hadiah dipakai pada', width: 17, value: (r) => wibDateTime(r.review.reward?.redeemedAt) },
  ]

  type QuestionRow = { question: string; scores: number[] }
  const questionRows: QuestionRow[] = questions.map((question) => ({
    question,
    scores: input.reviews.map((review) => score(review, question)).filter((value): value is number => typeof value === 'number'),
  }))
  const avg = (values: number[]) => (values.length ? round2(values.reduce((sum, value) => sum + value, 0) / values.length) : '')
  const countScore = (values: number[], target: number) => values.filter((value) => Math.round(value) === target).length

  type GroupRow = { name: string; reviews: StaffReview[] }
  const group = (key: (row: Row) => string | undefined): GroupRow[] => {
    const map = new Map<string, StaffReview[]>()
    for (const row of rows) {
      const name = key(row) || 'Tidak diketahui'
      map.set(name, [...(map.get(name) ?? []), row.review])
    }
    return [...map.entries()].map(([name, list]) => ({ name, reviews: list })).sort((a, b) => b.reviews.length - a.reviews.length || a.name.localeCompare(b.name, 'id'))
  }
  const groupColumns = (label: string): ExcelColumn<GroupRow>[] => [
    { header: label, width: 22, value: (r) => r.name },
    { header: 'Jumlah ulasan', kind: 'number', width: 12, value: (r) => r.reviews.length },
    { header: 'Rata-rata', kind: 'number', width: 10, value: (r) => avg(r.reviews.map((review) => review.averageScore)) },
    { header: 'Ulasan dengan catatan', kind: 'number', width: 14, value: (r) => r.reviews.filter((review) => review.note?.trim()).length },
  ]

  const all = input.reviews.map((review) => review.averageScore)
  type InfoRow = { label: string; value: string | number }
  return [
    tableSheet('Ulasan', columns, rows),
    tableSheet<QuestionRow>('Per pertanyaan', [
      { header: 'Pertanyaan', width: 40, value: (r) => r.question },
      { header: 'Jumlah jawaban', kind: 'number', width: 12, value: (r) => r.scores.length },
      { header: 'Rata-rata', kind: 'number', width: 10, value: (r) => avg(r.scores) },
      ...[5, 4, 3, 2, 1].map((star): ExcelColumn<QuestionRow> => ({ header: `Bintang ${star}`, kind: 'number', width: 9, value: (r) => countScore(r.scores, star) })),
    ], questionRows),
    tableSheet('Per florist', groupColumns('Florist'), group((row) => row.order?.florist)),
    tableSheet('Per cabang', groupColumns('Cabang'), group((row) => row.order?.branch)),
    tableSheet<InfoRow>('Info', [
      { header: 'Keterangan', width: 24, value: (r) => r.label },
      { header: 'Nilai', width: 30, value: (r) => r.value },
    ], [
      { label: 'Tanggal ulasan', value: input.summary.rangeLabel },
      { label: 'Jumlah ulasan', value: rows.length },
      { label: 'Rata-rata keseluruhan', value: avg(all) },
      { label: 'Hadiah sudah dipakai', value: input.reviews.filter((review) => review.reward?.status === 'redeemed').length },
      { label: 'Diunduh oleh', value: input.summary.exportedBy },
      { label: 'Diunduh pada', value: wibDateTime(input.summary.exportedAt) },
    ]),
  ]
}

export const reviewsExportFilename = (from?: string, to?: string): string =>
  `Ulasan_${from || to ? `${from ?? 'awal'}_sd_${to ?? 'akhir'}` : 'semua-tanggal'}.xlsx`
