/**
 * Laporan absensi bulanan (Excel): per-employee summary, daily attendance
 * against the effective schedule, and every attendance warning / overtime case.
 */
import type { OwnerSettingsStateValue } from '../types/settings'
import type { AttendanceRecord, AttendanceReviewCase, AttendanceReviewCaseStatus, AttendanceStatus, AttendanceWarningType, Employee, EmployeeDefaultSchedule, ScheduleOverride } from '../store/hrStoreTypes'
import type { HrMonthlyEmployeeReport } from './hrMonthlyReportDomain'
import { getEffectiveScheduleForDate } from './hrSchedulingDomain'
import { formatOvertimeDuration } from './payrollAdditionsDomain'
import { translateUiText } from '../i18n/translateUiText'
import { tableSheet, wibDateTime, yesNo, type ExcelColumn } from '../lib/excelTableExport'
import type { WorksheetSpec } from '../lib/financePeriodXlsxExport'

const STATUS_ID: Record<AttendanceStatus, string> = { present: 'Hadir', late: 'Telat', absent: 'Tidak hadir', leave: 'Cuti/izin' }
export const WARNING_ID: Record<AttendanceWarningType, string> = {
  late_check_in: 'Telat check-in',
  missing_check_in: 'Tidak check-in',
  missing_check_out: 'Lupa check-out',
  early_check_out: 'Pulang lebih awal',
  overtime: 'Lembur',
  wrong_branch: 'Salah cabang',
  scheduled_day_off: 'Masuk di hari libur',
  outside_shift_time: 'Di luar jam shift',
  delivery_late: 'Pengantaran telat',
}
const CASE_STATUS_ID: Record<AttendanceReviewCaseStatus, string> = {
  pending: 'Perlu ditinjau', resolved: 'Selesai', problem: 'Masalah', accepted: 'Disetujui', excused: 'Dimaafkan', corrected: 'Dikoreksi', penalized: 'Dikenai poin minus',
}
const ROLE_ID: Record<string, string> = { admin: 'Admin', florist: 'Florist', finance: 'Finance', hr: 'HR', owner: 'Owner' }
const WEEKDAY = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

/** The stored reason is English; the queue shows it in Indonesian, so the file does too. */
const reasonId = (item: AttendanceReviewCase): string => {
  if (item.warningType === 'overtime' && item.minutesDifference !== undefined) {
    return item.reason.startsWith('Employee claimed overtime')
      ? `Karyawan mengajukan lembur: check-out ${formatOvertimeDuration(item.minutesDifference)} setelah jam shift selesai.`
      : `Check-out ${formatOvertimeDuration(item.minutesDifference)} setelah jam shift selesai.`
  }
  return translateUiText(item.reason, 'id')
}

const daysInMonth = (month: string): string[] => {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return []
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)
}
const weekday = (date: string) => WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()]
const timeOf = (iso?: string) => (iso ? wibDateTime(iso).slice(11, 16) : '')

export interface AttendanceExportInput {
  month: string
  branchId: string | 'All'
  summaryRows: HrMonthlyEmployeeReport[]
  employees: Employee[]
  attendance: AttendanceRecord[]
  reviewCases: AttendanceReviewCase[]
  defaults: EmployeeDefaultSchedule[]
  overrides: ScheduleOverride[]
  settings: OwnerSettingsStateValue
  summary: { exportedBy: string; exportedAt: string }
}

export const buildAttendanceExportSheets = (input: AttendanceExportInput): WorksheetSpec[] => {
  const employeeIds = new Set(input.summaryRows.map((row) => row.employeeId))
  const employees = input.employees.filter((employee) => employeeIds.has(employee.id)).sort((a, b) => a.name.localeCompare(b.name, 'id'))
  const branchName = (id?: string) => (id ? input.settings.branches.find((branch) => branch.id === id)?.name ?? id : '')
  const cases = input.reviewCases.filter((item) => employeeIds.has(item.employeeId) && item.date.startsWith(input.month))
  const overtimeOf = (list: AttendanceReviewCase[]) => list.filter((item) => item.warningType === 'overtime' && item.status === 'accepted')

  type DayRow = { employee: Employee; date: string; shift: ReturnType<typeof getEffectiveScheduleForDate>['shift']; record?: AttendanceRecord; dayCases: AttendanceReviewCase[] }
  const dayRows: DayRow[] = []
  for (const date of daysInMonth(input.month)) {
    for (const employee of employees) {
      const { shift } = getEffectiveScheduleForDate({ employee, date, defaults: input.defaults, overrides: input.overrides, settings: input.settings })
      const record = input.attendance.find((item) => item.employeeId === employee.id && item.date === date)
      if (shift.isWorking && input.branchId !== 'All' && shift.branchId !== input.branchId && !record) continue
      if (!shift.isWorking && !record) continue
      dayRows.push({ employee, date, shift, record, dayCases: cases.filter((item) => item.employeeId === employee.id && item.date === date) })
    }
  }

  const dayColumns: ExcelColumn<DayRow>[] = [
    { header: 'Tanggal', width: 11, value: (r) => r.date },
    { header: 'Hari', width: 8, value: (r) => weekday(r.date) },
    { header: 'Nama', width: 22, value: (r) => r.employee.name },
    { header: 'Peran', width: 9, value: (r) => ROLE_ID[r.employee.systemRole] ?? r.employee.systemRole },
    { header: 'Jadwal', width: 20, value: (r) => (r.shift.isWorking ? `${branchName(r.shift.branchId)} ${r.shift.startTime}–${r.shift.endTime}` : 'Libur') },
    { header: 'Status', width: 11, value: (r) => (r.record ? STATUS_ID[r.record.status] ?? r.record.status : r.shift.isWorking ? 'Belum ada data' : '') },
    { header: 'Check-in', width: 8, value: (r) => timeOf(r.record?.checkInAt) },
    { header: 'Check-out', width: 9, value: (r) => timeOf(r.record?.checkOutAt) },
    { header: 'Check-in di lokasi', width: 10, value: (r) => (r.record?.checkInLocation ? yesNo(r.record.checkInLocation.withinRange) : '') },
    { header: 'Jarak check-in (m)', kind: 'number', width: 10, value: (r) => (r.record?.checkInLocation ? Math.round(r.record.checkInLocation.distanceMeters) : '') },
    { header: 'Alasan check-out', width: 14, value: (r) => (r.record?.checkOutReason === 'overtime' ? 'Lembur' : r.record?.checkOutReason === 'late_checkout' ? 'Telat check-out' : '') },
    { header: 'Catatan', width: 28, value: (r) => [r.record?.checkOutReasonNote, r.record?.note].filter(Boolean).join(' · ') },
    { header: 'Dicatat lewat', width: 11, value: (r) => (r.record ? (r.record.source === 'manual' ? 'HR' : 'Selfie') : '') },
    { header: 'Dikoreksi HR', width: 10, value: (r) => (r.record?.corrections?.length ? `${r.record.corrections.length}×` : '') },
    { header: 'Peringatan', width: 30, value: (r) => r.dayCases.map((item) => `${WARNING_ID[item.warningType] ?? item.warningType} (${CASE_STATUS_ID[item.status] ?? item.status})`).join('; ') },
    { header: 'Lembur disetujui', width: 14, value: (r) => { const minutes = overtimeOf(r.dayCases).reduce((sum, item) => sum + (item.approvedOvertimeMinutes ?? 0), 0); return minutes ? formatOvertimeDuration(minutes) : '' } },
    { header: 'Nominal lembur (Rp)', kind: 'money', width: 14, value: (r) => overtimeOf(r.dayCases).reduce((sum, item) => sum + (item.approvedOvertimeAmountIdr ?? 0), 0) || '' },
  ]

  const summaryColumns: ExcelColumn<HrMonthlyEmployeeReport>[] = [
    { header: 'Nama', width: 22, value: (r) => r.employeeName },
    { header: 'Peran', width: 9, value: (r) => ROLE_ID[r.role] ?? r.role },
    { header: 'Hari terjadwal', kind: 'number', width: 10, value: (r) => r.scheduledDays },
    { header: 'Hari di Kedamaian', kind: 'number', width: 10, value: (r) => r.kedamaianDays },
    { header: 'Hari di Pahoman', kind: 'number', width: 10, value: (r) => r.pahomanDays },
    { header: 'Hari hadir', kind: 'number', width: 9, value: (r) => r.presentDays },
    { header: 'Cuti/izin', kind: 'number', width: 9, value: (r) => r.leaveDays },
    { header: 'Libur', kind: 'number', width: 8, value: (r) => r.offDays },
    { header: 'Telat check-in', kind: 'number', width: 10, value: (r) => r.lateTasks },
    { header: 'Tidak check-in', kind: 'number', width: 10, value: (r) => r.missingCheckInTasks },
    { header: 'Lupa check-out', kind: 'number', width: 10, value: (r) => r.missingCheckOutTasks },
    { header: 'Masalah terbuka', kind: 'number', width: 10, value: (r) => r.openProblems },
    { header: 'Lembur disetujui', width: 14, value: (r) => { const minutes = overtimeOf(cases.filter((item) => item.employeeId === r.employeeId)).reduce((sum, item) => sum + (item.approvedOvertimeMinutes ?? 0), 0); return minutes ? formatOvertimeDuration(minutes) : '' } },
    { header: 'Nominal lembur (Rp)', kind: 'money', width: 14, value: (r) => overtimeOf(cases.filter((item) => item.employeeId === r.employeeId)).reduce((sum, item) => sum + (item.approvedOvertimeAmountIdr ?? 0), 0) },
  ]

  const nameOf = (id: string) => input.employees.find((employee) => employee.id === id)?.name ?? id
  const caseColumns: ExcelColumn<AttendanceReviewCase>[] = [
    { header: 'Tanggal', width: 11, value: (r) => r.date },
    { header: 'Nama', width: 22, value: (r) => nameOf(r.employeeId) },
    { header: 'Jenis', width: 18, value: (r) => WARNING_ID[r.warningType] ?? r.warningType },
    { header: 'Status', width: 16, value: (r) => CASE_STATUS_ID[r.status] ?? r.status },
    { header: 'Jadwal', width: 14, value: (r) => (r.scheduledStartTime ? `${r.scheduledStartTime}–${r.scheduledEndTime ?? ''}` : '') },
    { header: 'Waktu sebenarnya', width: 10, value: (r) => r.actualTime },
    { header: 'Selisih (menit)', kind: 'number', width: 9, value: (r) => r.minutesDifference },
    { header: 'Cabang jadwal', width: 12, value: (r) => r.scheduledBranchName ?? branchName(r.scheduledBranchId) },
    { header: 'Cabang terdeteksi', width: 12, value: (r) => r.detectedBranchName ?? branchName(r.detectedBranchId) },
    { header: 'No. pesanan', width: 16, value: (r) => r.orderNumber },
    { header: 'Keterangan sistem', width: 34, value: reasonId },
    { header: 'Catatan karyawan', width: 28, value: (r) => r.employeeNote },
    { header: 'Catatan HR', width: 28, value: (r) => r.reviewNote },
    { header: 'Poin minus diusulkan', kind: 'number', width: 10, value: (r) => r.proposedMinusPoints },
    { header: 'Lembur disetujui', width: 14, value: (r) => (r.approvedOvertimeMinutes ? formatOvertimeDuration(r.approvedOvertimeMinutes) : '') },
    { header: 'Nominal lembur (Rp)', kind: 'money', width: 14, value: (r) => r.approvedOvertimeAmountIdr },
    { header: 'Ditinjau oleh', width: 16, value: (r) => r.reviewedBy },
    { header: 'Ditinjau pada', width: 17, value: (r) => wibDateTime(r.reviewedAt) },
  ]

  type InfoRow = { label: string; value: string | number }
  return [
    tableSheet('Ringkasan', summaryColumns, input.summaryRows),
    tableSheet('Absensi harian', dayColumns, dayRows),
    tableSheet('Peringatan & lembur', caseColumns, cases.slice().sort((a, b) => a.date.localeCompare(b.date) || nameOf(a.employeeId).localeCompare(nameOf(b.employeeId), 'id'))),
    tableSheet<InfoRow>('Info', [
      { header: 'Keterangan', width: 24, value: (r) => r.label },
      { header: 'Nilai', width: 30, value: (r) => r.value },
    ], [
      { label: 'Bulan', value: input.month },
      { label: 'Cabang', value: input.branchId === 'All' ? 'Semua cabang' : branchName(input.branchId) },
      { label: 'Jumlah karyawan', value: input.summaryRows.length },
      { label: 'Diunduh oleh', value: input.summary.exportedBy },
      { label: 'Diunduh pada', value: wibDateTime(input.summary.exportedAt) },
    ]),
  ]
}

export const attendanceExportFilename = (month: string, branchId: string | 'All'): string =>
  `Absensi_${month}${branchId === 'All' ? '' : `_${branchId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}.xlsx`
