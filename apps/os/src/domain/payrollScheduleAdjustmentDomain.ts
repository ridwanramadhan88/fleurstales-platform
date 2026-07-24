import type { PayrollScheduleSnapshot } from './payrollScheduleDomain'

export type PayrollScheduleValidationResult =
  | { ok:true }
  | { ok:false; fieldErrors:Partial<Record<keyof PayrollScheduleSnapshot, string>>; reason:string }

const isIsoDate = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())

export const validatePayrollScheduleSnapshot = (value:PayrollScheduleSnapshot):PayrollScheduleValidationResult => {
  const fieldErrors:Partial<Record<keyof PayrollScheduleSnapshot, string>> = {}
  ;(['periodStart','periodEnd','hrSubmissionDeadline','financeReviewDeadline','paymentDate'] as const).forEach((field) => {
    if (!isIsoDate(value[field])) fieldErrors[field] = 'Select a valid date.'
  })
  if (Object.keys(fieldErrors).length) return { ok:false, fieldErrors, reason:'Correct the highlighted payroll schedule dates.' }
  if (value.periodStart > value.periodEnd) fieldErrors.periodEnd = 'Period end must be on or after period start.'
  if (value.periodEnd >= value.hrSubmissionDeadline) fieldErrors.hrSubmissionDeadline = 'HR submission must be after the earning period ends.'
  if (value.hrSubmissionDeadline > value.financeReviewDeadline) fieldErrors.financeReviewDeadline = 'Finance review cannot be before HR submission.'
  if (value.financeReviewDeadline > value.paymentDate) fieldErrors.paymentDate = 'Payment cannot be before Finance review.'
  return Object.keys(fieldErrors).length ? { ok:false, fieldErrors, reason:'Payroll schedule dates are not in a valid order.' } : { ok:true }
}

export interface PayrollScheduleAdjustmentImpact {
  requiresOwnerApproval:boolean
  reasons:string[]
  periodBoundaryChanged:boolean
  paymentMonthChanged:boolean
  deadlineMovedToPast:boolean
  submittedPayrollAffected:boolean
  verifiedPayrollAffected:boolean
}

export const evaluatePayrollScheduleAdjustment = (params:{
  current:PayrollScheduleSnapshot
  proposed:PayrollScheduleSnapshot
  today:string
  hasSubmittedPayrolls:boolean
  hasVerifiedPayrolls:boolean
}):PayrollScheduleAdjustmentImpact => {
  const periodBoundaryChanged = params.current.periodStart !== params.proposed.periodStart || params.current.periodEnd !== params.proposed.periodEnd
  const paymentMonthChanged = params.current.paymentDate.slice(0,7) !== params.proposed.paymentDate.slice(0,7)
  const deadlineMovedToPast = [params.proposed.hrSubmissionDeadline, params.proposed.financeReviewDeadline, params.proposed.paymentDate].some((date) => date < params.today)
  const submittedPayrollAffected = params.hasSubmittedPayrolls
  const verifiedPayrollAffected = params.hasVerifiedPayrolls
  const reasons:string[] = []
  if (periodBoundaryChanged) reasons.push('Payroll earning-period boundaries changed.')
  if (paymentMonthChanged) reasons.push('Payment date moved to another month.')
  if (deadlineMovedToPast) reasons.push('A deadline was moved into the past.')
  if (submittedPayrollAffected) reasons.push('Submitted employee payrolls are affected.')
  if (verifiedPayrollAffected) reasons.push('Finance-verified employee payrolls are affected.')
  return { requiresOwnerApproval:reasons.length > 0, reasons, periodBoundaryChanged, paymentMonthChanged, deadlineMovedToPast, submittedPayrollAffected, verifiedPayrollAffected }
}

export const payrollPeriodsOverlap = (a:PayrollScheduleSnapshot, b:PayrollScheduleSnapshot) => a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd
