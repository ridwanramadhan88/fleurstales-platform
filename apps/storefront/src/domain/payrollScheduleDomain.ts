import type { PayrollDefaultSettings } from '../types/settings'

export interface PayrollScheduleSnapshot {
  periodStart: string
  periodEnd: string
  hrSubmissionDeadline: string
  financeReviewDeadline: string
  paymentDate: string
}

const pad = (value: number) => String(value).padStart(2, '0')
const isoDate = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`

export const buildPayrollScheduleForPaymentMonth = (
  paymentYear: number,
  paymentMonth: number,
  settings: PayrollDefaultSettings,
): PayrollScheduleSnapshot => {
  const previousMonth = paymentMonth === 1 ? 12 : paymentMonth - 1
  const previousYear = paymentMonth === 1 ? paymentYear - 1 : paymentYear
  return {
    periodStart: isoDate(previousYear, previousMonth, settings.periodStartDay),
    periodEnd: isoDate(paymentYear, paymentMonth, settings.periodEndDay),
    hrSubmissionDeadline: isoDate(paymentYear, paymentMonth, settings.hrSubmissionDay),
    financeReviewDeadline: isoDate(paymentYear, paymentMonth, settings.financeReviewDay),
    paymentDate: isoDate(paymentYear, paymentMonth, settings.paymentDay),
  }
}

export const getPayrollPeriodKey = (snapshot: PayrollScheduleSnapshot) => snapshot.paymentDate.slice(0, 7)

export const getCurrentPayrollSchedule = (
  now: Date,
  settings: PayrollDefaultSettings,
): PayrollScheduleSnapshot => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  let year = Number(values.year)
  let month = Number(values.month)
  const day = Number(values.day)
  if (day > settings.paymentDay) {
    month += 1
    if (month === 13) { month = 1; year += 1 }
  }
  return buildPayrollScheduleForPaymentMonth(year, month, settings)
}

export const getPayrollScheduleStage = (
  snapshot: PayrollScheduleSnapshot,
  today: string,
): 'upcoming' | 'hr_preparation' | 'finance_review' | 'payment_due' | 'overdue' => {
  if (today <= snapshot.periodEnd) return 'upcoming'
  if (today <= snapshot.hrSubmissionDeadline) return 'hr_preparation'
  if (today <= snapshot.financeReviewDeadline) return 'finance_review'
  if (today <= snapshot.paymentDate) return 'payment_due'
  return 'overdue'
}


/** Resolves the generated payroll period that owns an activity date. */
const getPayrollScheduleForActivityDate = (
  activityDate: string,
  settings: PayrollDefaultSettings,
): PayrollScheduleSnapshot => {
  const [year, month] = activityDate.split('-').map(Number)
  const candidates = [
    buildPayrollScheduleForPaymentMonth(year, month, settings),
    buildPayrollScheduleForPaymentMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, settings),
  ]
  return candidates.find((item) => activityDate >= item.periodStart && activityDate <= item.periodEnd) ?? candidates[0]
}

export const getPayrollPeriodIdForActivityDate = (
  activityDate: string,
  settings: PayrollDefaultSettings,
): string => `payroll-${getPayrollPeriodKey(getPayrollScheduleForActivityDate(activityDate, settings))}`
