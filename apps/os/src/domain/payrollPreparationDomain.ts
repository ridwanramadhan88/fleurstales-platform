import type { EmployeePointEntry } from '../store/hrStoreTypes'

export const MONTHLY_POINT_BONUS_CAP_IDR = 500_000

export interface PayrollCalculation {
  positivePoints: number
  negativePoints: number
  netPoints: number
  bonusIdr: number
  finalPayrollIdr: number
}

export const calculateEmployeePayroll = (
  baseSalaryIdr: number,
  entries: Pick<EmployeePointEntry, 'points' | 'status'>[],
  pointValueIdr = 1_000,
): PayrollCalculation => {
  const approved = entries.filter((entry) => entry.status === 'approved')
  const positivePoints = approved.reduce((sum, entry) => sum + Math.max(0, entry.points), 0)
  const negativePoints = approved.reduce((sum, entry) => sum + Math.min(0, entry.points), 0)
  const netPoints = positivePoints + negativePoints
  const bonusIdr = Math.min(MONTHLY_POINT_BONUS_CAP_IDR, Math.max(0, netPoints) * Math.max(1, Math.round(pointValueIdr)))
  return { positivePoints, negativePoints, netPoints, bonusIdr, finalPayrollIdr: Math.max(0, baseSalaryIdr) + bonusIdr }
}

export const isPointEntryInsidePayrollPeriod = (
  entry: Pick<EmployeePointEntry, 'createdAt' | 'effectiveDate' | 'payrollPeriodId'>,
  periodStart: string,
  periodEnd: string,
): boolean => {
  if (entry.payrollPeriodId && entry.payrollPeriodId === `payroll-${periodEnd.slice(0, 7)}`) return true
  const date = entry.effectiveDate ?? entry.createdAt.slice(0, 10)
  return date >= periodStart && date <= periodEnd
}

export const isCompensationEffectiveForDate = (
  compensation: { effectiveFrom: string; effectiveTo?: string },
  date: string,
): boolean => compensation.effectiveFrom <= date && (!compensation.effectiveTo || compensation.effectiveTo >= date)
