import type { AttendanceReviewCase } from '../store/hrStoreTypes'

/**
 * Itemised payroll additions (Owner decision 2026-11-08). Overtime comes from
 * attendance: the employee chooses "Lembur" when checking out after the shift
 * end, HR confirms it and enters the amount, and the confirmed amount lands
 * here automatically. HR can add allowances, fees, manual bonuses,
 * meal/transport money and deductions by hand. `hrAdjustmentIdr` on the
 * payroll row stays the total so Finance and the server checks keep working.
 */
export type PayrollAdditionKind = 'overtime' | 'allowance' | 'fee' | 'bonus' | 'meal_transport' | 'deduction' | 'adjustment'

export interface PayrollAdditionLine {
  id: string
  kind: PayrollAdditionKind
  /** Signed: deductions are negative. */
  amountIdr: number
  reason: string
  attendanceCaseId?: string
  attendanceDate?: string
  overtimeMinutes?: number
  createdBy: string
  createdAt: string
}

export const PAYROLL_ADDITION_LABELS: Record<PayrollAdditionKind, { en: string; id: string }> = {
  overtime: { en: 'Overtime', id: 'Lembur' },
  allowance: { en: 'Allowance', id: 'Tunjangan' },
  fee: { en: 'Fee / commission', id: 'Fee / komisi' },
  bonus: { en: 'Manual bonus', id: 'Bonus manual' },
  meal_transport: { en: 'Meal / transport', id: 'Uang makan / transport' },
  deduction: { en: 'Deduction', id: 'Potongan' },
  adjustment: { en: 'Adjustment', id: 'Penyesuaian' },
}

/** Kinds HR adds by hand (overtime only comes from attendance). */
export const MANUAL_PAYROLL_ADDITION_KINDS: PayrollAdditionKind[] = ['allowance', 'fee', 'bonus', 'meal_transport', 'deduction']

export const sumPayrollAdditions = (lines: PayrollAdditionLine[]): number => lines.reduce((sum, line) => sum + line.amountIdr, 0)

/** Rows saved before itemisation carry one adjustment number: show it as one line. */
export const payrollAdditionLines = (draft: { id: string; hrAdjustments?: PayrollAdditionLine[]; hrAdjustmentIdr?: number; hrAdjustmentReason?: string; generatedAt?: string; generatedBy?: string }): PayrollAdditionLine[] => {
  if (Array.isArray(draft.hrAdjustments)) return draft.hrAdjustments
  if (!draft.hrAdjustmentIdr) return []
  return [{
    id: `${draft.id}-legacy-adjustment`,
    kind: 'adjustment',
    amountIdr: draft.hrAdjustmentIdr,
    reason: draft.hrAdjustmentReason?.trim() || 'Penyesuaian sebelumnya',
    createdBy: draft.generatedBy ?? 'HR',
    createdAt: draft.generatedAt ?? new Date(0).toISOString(),
  }]
}

export const overtimeLineForCase = (item: AttendanceReviewCase): PayrollAdditionLine | null => {
  if (item.warningType !== 'overtime' || item.status !== 'accepted' || !item.approvedOvertimeAmountIdr || item.approvedOvertimeAmountIdr <= 0) return null
  const minutes = item.approvedOvertimeMinutes ?? item.minutesDifference ?? 0
  return {
    id: `overtime-${item.id}`,
    kind: 'overtime',
    amountIdr: Math.round(item.approvedOvertimeAmountIdr),
    reason: `Lembur ${formatOvertimeDuration(minutes)} · ${item.date}`,
    attendanceCaseId: item.id,
    attendanceDate: item.date,
    overtimeMinutes: minutes,
    createdBy: item.reviewedBy ?? 'HR',
    createdAt: item.reviewedAt ?? item.createdAt,
  }
}

/** Confirmed overtime of one employee inside a payroll period. */
export const overtimeLinesForPeriod = (cases: AttendanceReviewCase[], employeeId: string, periodStart: string, periodEnd: string): PayrollAdditionLine[] =>
  cases
    .filter((item) => item.employeeId === employeeId && item.date >= periodStart && item.date <= periodEnd)
    .map(overtimeLineForCase)
    .filter((line): line is PayrollAdditionLine => Boolean(line))
    .sort((a, b) => (a.attendanceDate ?? '').localeCompare(b.attendanceDate ?? ''))

/** Keeps HR's manual lines and replaces the overtime lines with the confirmed attendance overtime. */
export const mergeOvertimeLines = (existing: PayrollAdditionLine[], overtime: PayrollAdditionLine[]): PayrollAdditionLine[] => [
  ...overtime,
  ...existing.filter((line) => line.kind !== 'overtime'),
]

export const formatOvertimeDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return `${hours} jam ${rest} menit`
  if (hours) return `${hours} jam`
  return `${rest} menit`
}
