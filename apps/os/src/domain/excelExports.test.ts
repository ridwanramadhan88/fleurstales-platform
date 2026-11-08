import { describe, expect, it } from 'vitest'
import type { StyledCell, WorkbookCell, WorksheetSpec } from '../lib/financePeriodXlsxExport'
import { buildReviewsExportSheets, filterReviewsForExport, reviewsExportFilename } from './reviewsExportDomain'
import { birthdayMonth, buildCustomersExportSheets } from './customersExportDomain'
import { buildPayrollExportSheets, payrollExportFilename } from './payrollExportDomain'
import { attendanceExportFilename, buildAttendanceExportSheets } from './attendanceExportDomain'
import { buildHrMonthlyReport } from './hrMonthlyReportDomain'
import { DEFAULT_OWNER_SETTINGS } from './settings/defaultOwnerSettings'
import { buildTableXlsx } from '../lib/excelTableExport'
import type { StaffReview } from '../data/staffReviews'
import type { OrderTableRow } from '../types/orders'
import type { EnrichedCustomer } from './customerDomain'
import type { EmployeePayrollDraft, PayrollPeriod } from '../store/payrollStore'
import type { Employee } from '../store/hrStoreTypes'

const v = (c: WorkbookCell) => (typeof c === 'object' && c !== null ? (c as StyledCell).value : c)
const table = (sheet: WorksheetSpec) => {
  const [head, ...body] = sheet.rows.map((row) => row.map(v))
  return body.map((row) => Object.fromEntries(head.map((h, i) => [String(h), row[i]])))
}

const review = (overrides: Partial<StaffReview>): StaffReview => ({
  id: 'r1', orderId: 'o1', orderNumber: 'FT-1', customerId: 'c1', customerName: 'Sari', customerWhatsapp: '0812', submittedAt: '2026-11-02T03:00:00Z',
  note: 'Bunganya segar', averageScore: 4.5, answers: [{ questionId: 'q1', question: 'Kualitas bunga', score: 5 }, { questionId: 'q2', question: 'Pelayanan', score: 4 }],
  reward: { id: 'w1', percentOff: null, amountOffIdr: 20000, minOrderIdr: 0, status: 'redeemed', issuedAt: '2026-11-02T03:00:00Z', redeemedAt: '2026-11-05T05:00:00Z', redeemedOrderId: 'o9' },
  ...overrides,
})
const order: OrderTableRow = { id: 'o1', orderNumber: 'FT-1', customerName: 'Sari', source: 'whatsapp', fulfillment: 'pickup', status: 'picked_up', totalIdr: 300000, branch: 'Kedamaian', paymentStatus: 'paid', createdAtLabel: '1 Nov', scheduleDate: '2026-11-01', florist: 'Vero' }

describe('reviews export', () => {
  it('has one column per question plus per-question, per-florist and per-branch summaries', () => {
    const reviews = [review({}), review({ id: 'r2', orderId: 'ox', orderNumber: 'FT-9', submittedAt: '2026-10-30T20:00:00Z', averageScore: 3, note: null, reward: null, answers: [{ questionId: 'q1', question: 'Kualitas bunga', score: 3 }] })]
    // 2026-10-30T20:00Z is 31 Oct in WIB
    expect(filterReviewsForExport(reviews, { from: '2026-10-31', to: '2026-10-31' }).map((r) => r.id)).toEqual(['r2'])
    const sheets = buildReviewsExportSheets({ reviews, orders: [order], orderProducts: () => 'Buket', summary: { rangeLabel: 'Semua', exportedBy: 'Owner', exportedAt: '2026-11-08T00:00:00Z' } })
    expect(sheets.map((s) => s.name)).toEqual(['Ulasan', 'Per pertanyaan', 'Per florist', 'Per cabang', 'Info'])
    const rows = table(sheets[0])
    expect(rows[0]).toMatchObject({ 'No. pesanan': 'FT-1', Cabang: 'Kedamaian', Florist: 'Vero', 'Rata-rata': 4.5, 'Kualitas bunga': 5, Pelayanan: 4, Hadiah: 'Potongan Rp20.000', 'Status hadiah': 'Sudah dipakai' })
    expect(rows[1]).toMatchObject({ Cabang: '', Pelayanan: '' })
    expect(table(sheets[1])[0]).toMatchObject({ Pertanyaan: 'Kualitas bunga', 'Jumlah jawaban': 2, 'Rata-rata': 4, 'Bintang 5': 1, 'Bintang 3': 1 })
    expect(table(sheets[2]).map((r) => r.Florist)).toEqual(['Tidak diketahui', 'Vero'].sort((a, b) => a.localeCompare(b, 'id')))
    expect(reviewsExportFilename('2026-11-01', '2026-11-30')).toBe('Ulasan_2026-11-01_sd_2026-11-30.xlsx')
  })
})

describe('customers export', () => {
  it('lists every profile with metrics, birthday month and review stats', () => {
    const customers: EnrichedCustomer[] = [{
      profile: { id: 'c1', name: 'Sari', whatsappNumber: '0812', normalizedWhatsappNumber: '62812', email: 's@x.id', birthday: '1990-05-02', tags: ['VIP lama'] },
      metrics: { lifetimeSpend: 900000, orderCount: 3, lastOrderDateLabel: '2026-11-01T03:00:00Z', lastOrderTimestamp: 1, averageOrderValue: 300000, mostUsedBranch: 'Kedamaian', segment: 'regular' },
      haystack: 'sari',
    }]
    const sheets = buildCustomersExportSheets({ customers, reviews: [review({})], summary: { filterLabel: 'Semua segmen', exportedBy: 'Owner', exportedAt: '2026-11-08T00:00:00Z' } })
    expect(sheets.map((s) => s.name)).toEqual(['Pelanggan', 'Ulang tahun per bulan', 'Info'])
    expect(table(sheets[0])[0]).toMatchObject({ Nama: 'Sari', 'Bulan ulang tahun': 'Mei', Segmen: 'Reguler', 'Total belanja terverifikasi (Rp)': 900000, 'Jumlah ulasan': 1, 'Rata-rata ulasan': 4.5, 'Pesanan terakhir': '2026-11-01 10:00' })
    expect(table(sheets[1])[4]).toMatchObject({ Bulan: 'Mei', 'Jumlah pelanggan': 1, Nama: 'Sari' })
    const withoutReviews = buildCustomersExportSheets({ customers, summary: { filterLabel: '', exportedBy: '', exportedAt: '' } })
    expect(withoutReviews[0].rows[0].map(v)).not.toContain('Jumlah ulasan')
    expect(birthdayMonth('12-25')).toBe('Desember')
    expect(birthdayMonth('bad')).toBe('')
  })
})

describe('payroll export', () => {
  const period: PayrollPeriod = { id: 'payroll-2026-11', periodStart: '2026-10-26', periodEnd: '2026-11-25', hrSubmissionDeadline: '2026-11-26', financeReviewDeadline: '2026-11-27', paymentDate: '2026-11-28', status: 'hr_preparation', createdAt: 'x', source: 'owner_defaults' }
  const draft = (overrides: Partial<EmployeePayrollDraft>): EmployeePayrollDraft => ({
    id: 'd1', payrollPeriodId: period.id, employeeId: 'e1', employeeName: 'Vero', employeeRole: 'florist', baseSalaryIdr: 2500000,
    positivePoints: 10, negativePoints: 2, netPoints: 8, bonusIdr: 80000, finalPayrollIdr: 2775000, pointEntries: [], status: 'draft', generatedAt: 'x', generatedBy: 'HR',
    hrAdjustmentIdr: 195000,
    hrAdjustments: [
      { id: 'l1', kind: 'overtime', amountIdr: 45000, reason: 'Lembur 1 jam 30 menit', attendanceCaseId: 'c1', attendanceDate: '2026-11-07', overtimeMinutes: 90, createdBy: 'HR', createdAt: '2026-11-07T10:00:00Z' },
      { id: 'l2', kind: 'fee', amountIdr: 150000, reason: 'Dekor wedding', createdBy: 'HR', createdAt: '2026-11-07T11:00:00Z' },
    ],
    ...overrides,
  })

  it('splits additions by kind, adds a TOTAL row and skips resolved payees', () => {
    const sheets = buildPayrollExportSheets({ period, drafts: [draft({}), draft({ id: 'd2', employeeName: 'Ani', employeeRole: 'admin', hrAdjustments: [], hrAdjustmentIdr: 0, finalPayrollIdr: 3000000, baseSalaryIdr: 3000000, bonusIdr: 0 }), draft({ id: 'd3', employeeName: 'Lama', status: 'resolved' })], summary: { exportedBy: 'HR', exportedAt: '2026-11-08T00:00:00Z' } })
    expect(sheets.map((s) => s.name)).toEqual(['Rekap gaji', 'Tambahan & potongan', 'Poin', 'Info'])
    const rows = table(sheets[0])
    expect(rows.map((r) => r.Nama)).toEqual(['Ani', 'Vero', 'TOTAL'])
    expect(rows[1]).toMatchObject({ 'Lembur (Rp)': 45000, 'Fee / komisi (Rp)': 150000, 'Potongan (Rp)': 0, 'Total gaji (Rp)': 2775000, Status: 'Draf' })
    expect(rows[2]).toMatchObject({ 'Gaji pokok (Rp)': 5500000, 'Lembur (Rp)': 45000, 'Total gaji (Rp)': 5775000, Status: '' })
    expect(table(sheets[1])[0]).toMatchObject({ Nama: 'Vero', Jenis: 'Lembur', 'Durasi lembur': '1 jam 30 menit', 'Tanggal absensi': '2026-11-07' })
    expect(payrollExportFilename(period)).toBe('Rekap_gaji_2026-11.xlsx')
    expect(buildTableXlsx(sheets).byteLength).toBeGreaterThan(1000)
  })
})

describe('attendance export', () => {
  const employee: Employee = { id: 'e1', name: 'Vero', position: 'Florist', branch: 'Kedamaian', systemRole: 'florist', status: 'active', phone: '', hireDate: '2026-01-01' }
  it('has summary, daily rows for recorded days and every warning case', () => {
    const attendance = [{ id: 'a1', employeeId: 'e1', date: '2026-11-07', status: 'present' as const, actor: 'Vero', createdAt: 'x', checkInAt: '2026-11-07T01:00:00Z', checkOutAt: '2026-11-07T10:35:00Z', checkOutReason: 'overtime' as const, checkOutReasonNote: 'Pesanan wedding' }]
    const reviewCases = [{ id: 'c1', attendanceId: 'a1', employeeId: 'e1', date: '2026-11-07', warningType: 'overtime' as const, status: 'accepted' as const, reason: 'Lembur', minutesDifference: 95, approvedOvertimeMinutes: 90, approvedOvertimeAmountIdr: 45000, reviewedBy: 'HR', createdAt: 'x' }]
    const params = { month: '2026-11', employees: [employee], attendance, reviewCases, defaults: [], overrides: [], settings: DEFAULT_OWNER_SETTINGS }
    const summaryRows = buildHrMonthlyReport({ ...params, branchId: 'All' })
    const sheets = buildAttendanceExportSheets({ ...params, branchId: 'All', summaryRows, summary: { exportedBy: 'HR', exportedAt: '2026-11-08T00:00:00Z' } })
    expect(sheets.map((s) => s.name)).toEqual(['Ringkasan', 'Absensi harian', 'Peringatan & lembur', 'Info'])
    expect(table(sheets[0])[0]).toMatchObject({ Nama: 'Vero', 'Hari hadir': 1, 'Lembur disetujui': '1 jam 30 menit', 'Nominal lembur (Rp)': 45000 })
    const day = table(sheets[1]).find((r) => r.Tanggal === '2026-11-07')
    expect(day).toMatchObject({ Hari: 'Sabtu', Status: 'Hadir', 'Check-in': '08:00', 'Check-out': '17:35', 'Alasan check-out': 'Lembur', 'Peringatan': 'Lembur (Disetujui)', 'Nominal lembur (Rp)': 45000 })
    expect(table(sheets[2])[0]).toMatchObject({ Jenis: 'Lembur', Status: 'Disetujui', 'Selisih (menit)': 95, 'Keterangan sistem': 'Check-out 1 jam 35 menit setelah jam shift selesai.' })
    expect(attendanceExportFilename('2026-11', 'Kedamaian')).toBe('Absensi_2026-11_kedamaian.xlsx')
  })
})
