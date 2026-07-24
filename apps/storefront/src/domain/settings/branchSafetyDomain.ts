import type { BranchSettings } from '../../types/settings'
import type { OrderTableRow } from '../../types/orders'
import type { EmployeeDefaultSchedule, ScheduleOverride } from '../../store/hrStoreTypes'
import type { StockItem, StockTransfer } from '../../store/stockStoreTypes'

const TERMINAL_ORDER_STATUSES = new Set(['delivered', 'picked_up', 'cancelled', 'failed'])
const TERMINAL_TRANSFER_STATUSES = new Set(['received', 'cancelled'])

export interface BranchDependencyImpact {
  branchId: string
  activeEmployees: number
  futureSchedules: number
  activeOrders: number
  stockUnits: number
  activeTransfers: number
  hasHistoricalOrders: boolean
  codeLocked: boolean
  blockingReasons: string[]
  canDeactivate: boolean
  canDelete: boolean
}

export interface BranchSafetyInput {
  branches: BranchSettings[]
  employeeDefaultSchedules: EmployeeDefaultSchedule[]
  scheduleOverrides: ScheduleOverride[]
  orders: OrderTableRow[]
  stockItems: StockItem[]
  stockTransfers: StockTransfer[]
  today?: string
}


/** Legacy compatibility: branch defaults are retired, so normalization clears all flags. */
export const normalizeDefaultBranch = (branches: BranchSettings[]): BranchSettings[] =>
  branches.map((branch) => ({ ...branch, isDefault: false }))

export const buildBranchDependencyImpacts = ({
  branches,
  employeeDefaultSchedules,
  scheduleOverrides,
  orders,
  stockItems,
  stockTransfers,
  today = new Date().toISOString().slice(0, 10),
}: BranchSafetyInput): Record<string, BranchDependencyImpact> => {
  const impacts: Record<string, BranchDependencyImpact> = {}

  for (const branch of branches) {
    const activeEmployees = 0
    const overrideKeys = new Set(
      scheduleOverrides
        .filter((override) => override.date >= today && override.shift.isWorking && override.shift.branchId === branch.id)
        .map((override) => `${override.employeeId}:${override.date}`),
    )
    const defaultScheduleCount = employeeDefaultSchedules.filter((schedule) =>
      Object.values(schedule.days).some((shift) => shift.isWorking && shift.branchId === branch.id),
    ).length
    const futureSchedules = overrideKeys.size + defaultScheduleCount
    const branchOrders = orders.filter((order) => order.branch === branch.id)
    const activeOrders = branchOrders.filter((order) => !TERMINAL_ORDER_STATUSES.has(order.status)).length
    const stockUnits = stockItems
      .filter((item) => item.branch === branch.id && !item.isArchived)
      .reduce((sum, item) => sum + Math.max(0, item.availableQty) + Math.max(0, item.reservedQty), 0)
    const activeTransfers = stockTransfers.filter(
      (transfer) =>
        !TERMINAL_TRANSFER_STATUSES.has(transfer.status) &&
        (transfer.fromBranch === branch.id || transfer.toBranch === branch.id),
    ).length

    const blockingReasons: string[] = []
    if (activeEmployees) blockingReasons.push(`${activeEmployees} active employee(s) are assigned here.`)
    if (futureSchedules) blockingReasons.push(`${futureSchedules} future/default schedule reference(s) use this branch.`)
    if (activeOrders) blockingReasons.push(`${activeOrders} active order(s) still belong to this branch.`)
    if (stockUnits) blockingReasons.push(`${stockUnits} stock unit(s) remain at this branch.`)
    if (activeTransfers) blockingReasons.push(`${activeTransfers} active stock transfer(s) reference this branch.`)

    const hasHistoricalOrders = branchOrders.length > 0
    impacts[branch.id] = {
      branchId: branch.id,
      activeEmployees,
      futureSchedules,
      activeOrders,
      stockUnits,
      activeTransfers,
      hasHistoricalOrders,
      codeLocked: hasHistoricalOrders,
      blockingReasons,
      canDeactivate: blockingReasons.length === 0,
      canDelete: !hasHistoricalOrders && blockingReasons.length === 0,
    }
  }

  return impacts
}
