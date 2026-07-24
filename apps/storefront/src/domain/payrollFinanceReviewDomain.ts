import type { EmployeePayrollDraft } from '../store/payrollStore'

export type PayrollFinanceValidationResult =
  | { ok: true }
  | { ok: false; reason: string }

export const validatePayrollForFinance = (draft: EmployeePayrollDraft): PayrollFinanceValidationResult => {
  if (draft.baseSalaryIdr <= 0) return { ok:false, reason:'Base salary must be greater than zero.' }

  const ids = new Set<string>()
  const sources = new Set<string>()
  let positivePoints = 0
  let negativePoints = 0
  for (const entry of draft.pointEntries) {
    if (ids.has(entry.id)) return { ok:false, reason:'Payroll contains a duplicate point-entry snapshot.' }
    ids.add(entry.id)
    const sourceKey = `${entry.sourceType}:${entry.sourceId}`
    if (sources.has(sourceKey)) return { ok:false, reason:'Payroll contains duplicate point evidence from the same source.' }
    sources.add(sourceKey)
    if (entry.points >= 0) positivePoints += entry.points
    else negativePoints += entry.points
  }

  const netPoints = positivePoints + negativePoints
  const bonusIdr = Math.max(0, netPoints) * 1_000
  const adjustmentIdr = draft.hrAdjustmentIdr ?? 0
  const finalPayrollIdr = draft.baseSalaryIdr + bonusIdr + adjustmentIdr
  if (finalPayrollIdr < draft.baseSalaryIdr) return { ok:false, reason:'HR adjustment cannot reduce payroll below base salary.' }

  if (draft.positivePoints !== positivePoints) return { ok:false, reason:'Positive-point total does not match the evidence snapshot.' }
  if (draft.negativePoints !== negativePoints) return { ok:false, reason:'Minus-point total does not match the evidence snapshot.' }
  if (draft.netPoints !== netPoints) return { ok:false, reason:'Net-point total is incorrect.' }
  if (draft.bonusIdr !== bonusIdr) return { ok:false, reason:'Point bonus calculation is incorrect.' }
  if (draft.finalPayrollIdr !== finalPayrollIdr) return { ok:false, reason:'Final payroll calculation is incorrect.' }

  return { ok:true }
}
