import type { EmployeePointEntry } from '../store/hrStoreTypes'

export const MONTHLY_POINT_BONUS_CAP_IDR = 500_000

export interface PayrollCalculationPolicy {
  pointValueIdr: number
  bonusCapIdr: number
}

export const DEFAULT_PAYROLL_CALCULATION_POLICY: PayrollCalculationPolicy = {
  pointValueIdr: 1_000,
  bonusCapIdr: MONTHLY_POINT_BONUS_CAP_IDR,
}

export const buildPayrollCalculationPolicy = (
  pointValueIdr: number,
  bonusCapIdr = MONTHLY_POINT_BONUS_CAP_IDR,
): PayrollCalculationPolicy => ({
  pointValueIdr: Math.max(1, Math.round(pointValueIdr)),
  bonusCapIdr: Math.max(0, Math.round(bonusCapIdr)),
})

export interface PayrollCalculation {
  positivePoints: number
  negativePoints: number
  netPoints: number
  bonusIdr: number
  finalPayrollIdr: number
}

export const calculatePayrollFromPointValues = (
  baseSalaryIdr: number,
  entries: Pick<EmployeePointEntry, 'points'>[],
  policy: PayrollCalculationPolicy = DEFAULT_PAYROLL_CALCULATION_POLICY,
): PayrollCalculation => {
  const normalizedPolicy = buildPayrollCalculationPolicy(policy.pointValueIdr, policy.bonusCapIdr)
  const positivePoints = entries.reduce((sum, entry) => sum + Math.max(0, entry.points), 0)
  const negativePoints = entries.reduce((sum, entry) => sum + Math.min(0, entry.points), 0)
  const netPoints = positivePoints + negativePoints
  const bonusIdr = Math.min(normalizedPolicy.bonusCapIdr, Math.max(0, netPoints) * normalizedPolicy.pointValueIdr)
  return { positivePoints, negativePoints, netPoints, bonusIdr, finalPayrollIdr: Math.max(0, baseSalaryIdr) + bonusIdr }
}

export const calculateEmployeePayroll = (
  baseSalaryIdr: number,
  entries: Pick<EmployeePointEntry, 'points' | 'status'>[],
  pointValueIdr = DEFAULT_PAYROLL_CALCULATION_POLICY.pointValueIdr,
): PayrollCalculation => calculatePayrollFromPointValues(
  baseSalaryIdr,
  entries.filter((entry) => entry.status === 'approved'),
  buildPayrollCalculationPolicy(pointValueIdr),
)

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
