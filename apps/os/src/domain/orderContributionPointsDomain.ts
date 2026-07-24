import type { OrderTableRow } from '../types/orders'
import type { Employee, EmployeePointEntry } from '../store/hrStoreTypes'
import type { PayrollDefaultSettings } from '../types/settings'
import { getPayrollPeriodIdForActivityDate } from './payrollScheduleDomain'

export interface OrderContributionRules {
  collectOrderMinimumProductSubtotalIdr: number
  collectOrderPoints: number
  adminMinimumHandledOrders: number
  adminPointsPerAdditionalOrder: number
  late1To15PenaltyPoints: number
  late16To30PenaltyPoints: number
  lateOver30PenaltyPoints: number
  missingCheckoutPenaltyPoints: number
  maximumMinusPointsPerPeriod: number
  /** Orders completed before this instant are never backfilled automatically. */
  orderContributionActiveFrom: string
}

export const DEFAULT_ORDER_CONTRIBUTION_RULES: OrderContributionRules = {
  collectOrderMinimumProductSubtotalIdr: 200_000,
  collectOrderPoints: 1,
  adminMinimumHandledOrders: 0,
  adminPointsPerAdditionalOrder: 1,
  late1To15PenaltyPoints: 5,
  late16To30PenaltyPoints: 10,
  lateOver30PenaltyPoints: 20,
  missingCheckoutPenaltyPoints: 10,
  maximumMinusPointsPerPeriod: 100,
  orderContributionActiveFrom: '2026-07-17T12:00:00+07:00',
}

export const MONTHLY_POINT_BONUS_CAP_IDR = 500_000

export type OrderContributionThresholdRules = Partial<Pick<OrderContributionRules, 'collectOrderMinimumProductSubtotalIdr' | 'collectOrderPoints' | 'adminMinimumHandledOrders' | 'adminPointsPerAdditionalOrder' | 'orderContributionActiveFrom'>>

export type OrderContributionCategory = 'admin_order_handled' | 'florist_order_completed'

export interface ExpectedOrderContribution {
  employeeId: string
  orderNumber: string
  category: OrderContributionCategory
  points: number
  sourceId: string
  periodKey: string
  payrollPeriodId: string
  effectiveDate: string
  ordinal: number
  minimumIncluded: number
  sourceAmountIdr: number
  sourceCompletedAt: string
}

export interface EmployeePointSummary {
  employeeId: string
  employeeName: string
  role: Employee['systemRole']
  periodKey: string
  adminEligibleOrders: number
  adminMinimumIncluded: number
  adminPointEligibleOrders: number
  pendingPoints: number
  approvedPositivePoints: number
  approvedNegativePoints: number
  approvedNetPoints: number
  estimatedBonusIdr: number
}

const effectiveDateForOrder = (order: OrderTableRow): string => {
  const raw = order.completedAt ?? ''
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : 'unknown'
}

const periodKeyForOrder = (order: OrderTableRow, payrollSettings?: PayrollDefaultSettings): string => {
  const date = effectiveDateForOrder(order)
  if (date === 'unknown') return 'unknown'
  return payrollSettings ? getPayrollPeriodIdForActivityDate(date, payrollSettings).replace('payroll-', '') : date.slice(0, 7)
}

const getOrderProductSubtotalIdr = (order: OrderTableRow): number =>
  order.items?.length
    ? order.items.reduce((total, item) => total + Math.max(0, item.quantity) * Math.max(0, item.unitPriceIdr), 0)
    : Math.max(0, order.totalIdr)

const isOrderEligibleForContributionPoints = (order: OrderTableRow, minimumProductSubtotalIdr = 200_000): boolean =>
  Boolean(
    (order.status === 'delivered' || order.status === 'picked_up') &&
      getOrderProductSubtotalIdr(order) >= minimumProductSubtotalIdr &&
      Boolean(order.completedAt && !Number.isNaN(new Date(order.completedAt).getTime())) &&
      order.paymentStatus !== 'refunded',
  )

const sortOrders = (orders: OrderTableRow[]) =>
  [...orders].sort((a, b) => {
    const aTime = a.completedAt ?? a.orderNumber
    const bTime = b.completedAt ?? b.orderNumber
    return aTime.localeCompare(bTime) || a.orderNumber.localeCompare(b.orderNumber)
  })

export const validateOrderContributionRules = (
  rules: OrderContributionRules,
): { ok: true } | { ok: false; field: keyof OrderContributionRules; reason: string } => {
  const wholeNonNegative: Array<Exclude<keyof OrderContributionRules, 'orderContributionActiveFrom'>> = [
    'collectOrderMinimumProductSubtotalIdr',
    'late1To15PenaltyPoints',
    'late16To30PenaltyPoints',
    'lateOver30PenaltyPoints',
    'missingCheckoutPenaltyPoints',
  ]
  for (const field of wholeNonNegative) {
    if (!Number.isInteger(rules[field]) || rules[field] < 0) {
      return { ok: false, field, reason: 'Enter a whole number of 0 or more.' }
    }
  }
  const positive: Array<Exclude<keyof OrderContributionRules, 'orderContributionActiveFrom'>> = [
    'collectOrderPoints',
    'maximumMinusPointsPerPeriod',
  ]
  for (const field of positive) {
    if (!Number.isInteger(rules[field]) || rules[field] <= 0) {
      return { ok: false, field, reason: 'Enter a whole number greater than 0.' }
    }
  }
  if (!rules.orderContributionActiveFrom || Number.isNaN(new Date(rules.orderContributionActiveFrom).getTime())) {
    return { ok: false, field: 'orderContributionActiveFrom', reason: 'Order contribution activation date is invalid.' }
  }
  return { ok: true }
}

export const buildExpectedOrderContributions = ({
  orders,
  employees,
  rules = DEFAULT_ORDER_CONTRIBUTION_RULES,
  payrollSettings,
}: {
  orders: OrderTableRow[]
  employees: Employee[]
  rules?: OrderContributionThresholdRules
  payrollSettings?: PayrollDefaultSettings
}): ExpectedOrderContribution[] => {
  const resolvedRules: OrderContributionThresholdRules = {
    collectOrderMinimumProductSubtotalIdr: rules?.collectOrderMinimumProductSubtotalIdr ?? DEFAULT_ORDER_CONTRIBUTION_RULES.collectOrderMinimumProductSubtotalIdr,
    collectOrderPoints: rules?.collectOrderPoints ?? DEFAULT_ORDER_CONTRIBUTION_RULES.collectOrderPoints,
    orderContributionActiveFrom: rules?.orderContributionActiveFrom ?? DEFAULT_ORDER_CONTRIBUTION_RULES.orderContributionActiveFrom,
  }
  const employeeIds = new Set(employees.map((employee) => employee.id))
  const activeFrom = new Date(resolvedRules.orderContributionActiveFrom ?? DEFAULT_ORDER_CONTRIBUTION_RULES.orderContributionActiveFrom).getTime()
  const eligible = sortOrders(orders.filter((order) =>
    isOrderEligibleForContributionPoints(order, resolvedRules.collectOrderMinimumProductSubtotalIdr) &&
    Boolean(order.completedAt && new Date(order.completedAt).getTime() >= activeFrom),
  ))
  const counters = new Map<string, number>()
  const contributions: ExpectedOrderContribution[] = []

  const visit = (
    order: OrderTableRow,
    employeeId: string | undefined,
    category: OrderContributionCategory,
    minimumIncluded: number,
    points: number,
  ) => {
    if (!employeeId || !employeeIds.has(employeeId)) return
    const effectiveDate = effectiveDateForOrder(order)
    const payrollPeriodId = payrollSettings && effectiveDate !== 'unknown' ? getPayrollPeriodIdForActivityDate(effectiveDate, payrollSettings) : `payroll-${periodKeyForOrder(order)}`
    const periodKey = payrollPeriodId.replace('payroll-', '')
    const counterKey = `${employeeId}:${category}:${periodKey}`
    const ordinal = (counters.get(counterKey) ?? 0) + 1
    counters.set(counterKey, ordinal)
    if (ordinal <= minimumIncluded) return
    contributions.push({
      employeeId,
      orderNumber: order.orderNumber,
      category,
      points,
      sourceId: `order:${order.orderNumber}:${category}`,
      periodKey,
      payrollPeriodId,
      effectiveDate,
      ordinal,
      minimumIncluded,
      sourceAmountIdr:getOrderProductSubtotalIdr(order),
      sourceCompletedAt:order.completedAt!,
    })
  }

  for (const order of eligible) {
    visit(
      order,
      order.adminHandledEmployeeId,
      'admin_order_handled',
      0,
      resolvedRules.collectOrderPoints ?? 1,
    )
    visit(
      order,
      order.floristAssignedEmployeeId,
      'florist_order_completed',
      0,
      resolvedRules.collectOrderPoints ?? 1,
    )
  }

  return contributions
}

export const buildEmployeePointSummaries = ({
  orders,
  employees,
  entries,
  rules,
  periodKey,
  payrollSettings,
}: {
  orders: OrderTableRow[]
  employees: Employee[]
  entries: EmployeePointEntry[]
  rules: OrderContributionRules
  periodKey: string
  payrollSettings?: PayrollDefaultSettings
}): EmployeePointSummary[] => {
  const eligible = orders.filter(
    (order) => isOrderEligibleForContributionPoints(order, rules.collectOrderMinimumProductSubtotalIdr) && new Date(order.completedAt!).getTime() >= new Date(rules.orderContributionActiveFrom).getTime() && periodKeyForOrder(order, payrollSettings) === periodKey,
  )

  return employees
    .filter((employee) => employee.status === 'active')
    .map((employee) => {
      const adminEligibleOrders = eligible.filter(
        (order) => order.adminHandledEmployeeId === employee.id,
      ).length
      const employeeEntries = entries.filter(
        (entry) => entry.employeeId === employee.id && (entry.payrollPeriodId?.replace('payroll-', '') ?? entry.periodKey ?? entry.effectiveDate?.slice(0, 7) ?? entry.createdAt.slice(0, 7)) === periodKey,
      )
      const pendingPoints = employeeEntries
        .filter((entry) => entry.status === 'pending')
        .reduce((total, entry) => total + entry.points, 0)
      const approvedEntries = employeeEntries.filter((entry) => entry.status === 'approved')
      const approvedPositivePoints = approvedEntries
        .filter((entry) => entry.points > 0)
        .reduce((total, entry) => total + entry.points, 0)
      const approvedNegativePoints = approvedEntries
        .filter((entry) => entry.points < 0)
        .reduce((total, entry) => total + Math.abs(entry.points), 0)
      const approvedNetPoints = approvedPositivePoints - approvedNegativePoints

      return {
        employeeId: employee.id,
        employeeName: employee.name,
        role: employee.systemRole,
        periodKey,
        adminEligibleOrders,
        adminMinimumIncluded: 0,
        adminPointEligibleOrders: adminEligibleOrders,
        pendingPoints,
        approvedPositivePoints,
        approvedNegativePoints,
        approvedNetPoints,
        estimatedBonusIdr: Math.min(MONTHLY_POINT_BONUS_CAP_IDR, Math.max(0, approvedNetPoints) * (payrollSettings?.pointValueIdr ?? 1_000)),
      }
    })
    .filter(
      (summary) =>
        summary.role === 'admin' ||
        summary.pendingPoints !== 0 ||
        summary.approvedNetPoints !== 0,
    )
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName))
}

