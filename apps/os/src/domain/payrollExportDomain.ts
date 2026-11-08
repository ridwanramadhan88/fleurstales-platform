/**
 * Rekap gaji Excel export for one payroll period: one row per payee with every
 * addition kind in its own column, plus the addition lines and point entries.
 */
import type { EmployeePayrollDraft, EmployeePayrollStatus, PayrollManualPayeeType, PayrollPeriod, PayrollPointSnapshot } from '../store/payrollStore'
import { PAYROLL_ADDITION_LABELS, payrollAdditionLines, formatOvertimeDuration, type PayrollAdditionKind, type PayrollAdditionLine } from './payrollAdditionsDomain'
import { tableSheet, wibDate, wibDateTime, type ExcelColumn } from '../lib/excelTableExport'
import { cell, type WorkbookCell, type WorksheetSpec } from '../lib/financePeriodXlsxExport'

export const PAYROLL_STATUS_ID: Record<EmployeePayrollStatus, string> = {
  draft: 'Draf',
  pending_finance_review: 'Menunggu Finance',
  finance_rejected: 'Dikembalikan Finance',
  finance_verified: 'Disetujui Finance',
  paid: 'Dibayar',
  resolved: 'Diselesaikan',
}

const PAYEE_ID: Record<PayrollManualPayeeType, string> = { owner: 'Owner', part_time: 'Paruh waktu', contractor: 'Kontraktor / freelance', other: 'Lainnya' }
const ROLE_ID: Record<string, string> = { owner: 'Owner', admin: 'Admin', florist: 'Florist', finance: 'Finance', hr: 'HR', courier: 'Kurir', driver: 'Kurir' }
const ADDITION_KINDS: PayrollAdditionKind[] = ['overtime', 'fee', 'allowance', 'bonus', 'meal_transport', 'deduction', 'adjustment']

export interface PayrollExportInput {
  period: PayrollPeriod
  drafts: EmployeePayrollDraft[]
  summary: { exportedBy: string; exportedAt: string }
}

const kindTotal = (lines: PayrollAdditionLine[], kind: PayrollAdditionKind) =>
  lines.filter((line) => line.kind === kind).reduce((sum, line) => sum + line.amountIdr, 0)

/** Bold TOTAL row: sums money/number columns, blank elsewhere. Points are summed too. */
const totalRowFor = <Row>(columns: ExcelColumn<Row>[], body: WorkbookCell[][]): WorkbookCell[] => columns.map((column, index) => {
  if (index === 0) return cell('TOTAL', 'total')
  if (column.kind !== 'money' && column.kind !== 'number') return ''
  const sum = body.reduce((acc, row) => {
    const value = row[index]
    const raw = typeof value === 'object' && value !== null ? value.value : value
    return acc + (typeof raw === 'number' ? raw : 0)
  }, 0)
  return column.kind === 'money' ? cell(sum, 'total') : sum
})

export const buildPayrollExportSheets = (input: PayrollExportInput): WorksheetSpec[] => {
  type Row = { draft: EmployeePayrollDraft; lines: PayrollAdditionLine[] }
  const rows: Row[] = input.drafts
    .filter((draft) => draft.status !== 'resolved')
    .map((draft) => ({ draft, lines: payrollAdditionLines(draft) }))
    .sort((a, b) => a.draft.employeeName.localeCompare(b.draft.employeeName, 'id'))

  const columns: ExcelColumn<Row>[] = [
    { header: 'Nama', width: 22, value: (r) => r.draft.employeeName },
    { header: 'Peran', width: 11, value: (r) => ROLE_ID[r.draft.employeeRole] ?? r.draft.employeeRole },
    { header: 'Jenis', width: 18, value: (r) => (r.draft.entryMode === 'manual' ? `Manual · ${PAYEE_ID[r.draft.manualPayeeType ?? 'other']}` : 'Karyawan') },
    { header: 'Gaji pokok (Rp)', kind: 'money', value: (r) => r.draft.baseSalaryIdr },
    { header: 'Poin +', kind: 'number', width: 8, value: (r) => r.draft.positivePoints },
    { header: 'Poin −', kind: 'number', width: 8, value: (r) => r.draft.negativePoints },
    { header: 'Poin bersih', kind: 'number', width: 9, value: (r) => r.draft.netPoints },
    { header: 'Bonus poin (Rp)', kind: 'money', value: (r) => r.draft.bonusIdr },
    ...ADDITION_KINDS.map((kind): ExcelColumn<Row> => ({ header: `${PAYROLL_ADDITION_LABELS[kind].id} (Rp)`, kind: 'money', value: (r) => kindTotal(r.lines, kind) })),
    { header: 'Total tambahan & potongan (Rp)', kind: 'money', width: 16, value: (r) => r.draft.hrAdjustmentIdr ?? 0 },
    { header: 'Total gaji (Rp)', kind: 'money', width: 15, value: (r) => r.draft.finalPayrollIdr },
    { header: 'Status', width: 18, value: (r) => PAYROLL_STATUS_ID[r.draft.status] ?? r.draft.status },
    { header: 'Alasan manual / pengembalian', width: 28, value: (r) => [r.draft.manualReason, r.draft.rejectionReason].filter(Boolean).join(' · ') },
    { header: 'Dikirim ke Finance', width: 17, value: (r) => wibDateTime(r.draft.submittedAt) },
    { header: 'Disetujui Finance oleh', width: 16, value: (r) => r.draft.financeReviewedBy },
    { header: 'Disetujui pada', width: 17, value: (r) => wibDateTime(r.draft.financeReviewedAt) },
    { header: 'Dibayar pada', width: 17, value: (r) => wibDateTime(r.draft.paidAt) },
    { header: 'Dibayar oleh', width: 16, value: (r) => r.draft.paidBy },
    { header: 'Metode bayar', width: 12, value: (r) => r.draft.paymentMethod },
    { header: 'Referensi bayar', width: 18, value: (r) => r.draft.paymentReference },
    { header: 'Catatan bayar', width: 24, value: (r) => r.draft.paymentNote },
  ]

  const recap = tableSheet('Rekap gaji', columns, rows)
  if (rows.length) recap.rows.push(totalRowFor(columns, recap.rows.slice(1)))

  type LineRow = { draft: EmployeePayrollDraft; line: PayrollAdditionLine }
  const lineRows: LineRow[] = rows.flatMap((r) => r.lines.map((line) => ({ draft: r.draft, line })))
  type PointRow = { draft: EmployeePayrollDraft; entry: PayrollPointSnapshot }
  const pointRows: PointRow[] = rows.flatMap((r) => (r.draft.pointEntries ?? []).map((entry) => ({ draft: r.draft, entry })))
    .sort((a, b) => a.draft.employeeName.localeCompare(b.draft.employeeName, 'id') || a.entry.createdAt.localeCompare(b.entry.createdAt))

  type InfoRow = { label: string; value: string | number }
  const total = (pick: (r: Row) => number) => rows.reduce((sum, r) => sum + pick(r), 0)
  return [
    recap,
    tableSheet<LineRow>('Tambahan & potongan', [
      { header: 'Nama', width: 22, value: (r) => r.draft.employeeName },
      { header: 'Jenis', width: 20, value: (r) => PAYROLL_ADDITION_LABELS[r.line.kind]?.id ?? r.line.kind },
      { header: 'Nominal (Rp)', kind: 'money', value: (r) => r.line.amountIdr },
      { header: 'Alasan', width: 36, value: (r) => r.line.reason },
      { header: 'Tanggal absensi', width: 13, value: (r) => r.line.attendanceDate },
      { header: 'Durasi lembur', width: 14, value: (r) => (r.line.overtimeMinutes ? formatOvertimeDuration(r.line.overtimeMinutes) : '') },
      { header: 'Dicatat oleh', width: 16, value: (r) => r.line.createdBy },
      { header: 'Dicatat pada', width: 17, value: (r) => wibDateTime(r.line.createdAt) },
    ], lineRows),
    tableSheet<PointRow>('Poin', [
      { header: 'Nama', width: 22, value: (r) => r.draft.employeeName },
      { header: 'Tanggal', width: 17, value: (r) => wibDateTime(r.entry.createdAt) },
      { header: 'Poin', kind: 'number', width: 7, value: (r) => r.entry.points },
      { header: 'Alasan', width: 40, value: (r) => r.entry.reason },
      { header: 'No. pesanan', width: 16, value: (r) => r.entry.orderNumber },
    ], pointRows),
    tableSheet<InfoRow>('Info', [
      { header: 'Keterangan', width: 26, value: (r) => r.label },
      { header: 'Nilai', width: 30, value: (r) => r.value },
    ], [
      { label: 'Periode kerja', value: `${wibDate(input.period.periodStart)} s/d ${wibDate(input.period.periodEnd)}` },
      { label: 'Tanggal gajian', value: wibDate(input.period.paymentDate) },
      { label: 'Jumlah penerima', value: rows.length },
      { label: 'Total gaji pokok (Rp)', value: total((r) => r.draft.baseSalaryIdr) },
      { label: 'Total bonus poin (Rp)', value: total((r) => r.draft.bonusIdr) },
      { label: 'Total lembur (Rp)', value: total((r) => kindTotal(r.lines, 'overtime')) },
      { label: 'Total tambahan & potongan (Rp)', value: total((r) => r.draft.hrAdjustmentIdr ?? 0) },
      { label: 'Total gaji (Rp)', value: total((r) => r.draft.finalPayrollIdr) },
      { label: 'Diunduh oleh', value: input.summary.exportedBy },
      { label: 'Diunduh pada', value: wibDateTime(input.summary.exportedAt) },
    ]),
  ]
}

export const payrollExportFilename = (period: PayrollPeriod): string => `Rekap_gaji_${period.paymentDate.slice(0, 7)}.xlsx`
