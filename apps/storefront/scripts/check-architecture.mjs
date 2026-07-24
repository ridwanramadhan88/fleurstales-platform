import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const sourceRoot = path.join(root, 'src')
const retiredFiles = [
  'domain/revenueCompareDomain.ts',
  'domain/revenueBreakdownDomain.ts',
  'domain/orderStatsDomain.ts',
]
const retiredExports = [
  'getLifecycleBucketForOrder', 'splitOrdersByLifecycle', 'groupOrdersByStatus',
  'filterOrders', 'getActiveOrders', 'getDeliveryOrders', 'getCompletedOrders', 'getExceptionOrders',
  'resolveCompareRange', 'getIncomeExpenseTrend', 'getBranchCompareTrend',
  'getPeriodVsPreviousTrend', 'getRevenueVsPreviousPeriod', 'resolveTransactionCompareRange',
  'getRevenueSummary', 'getConfirmedVsPendingRevenue', 'getBookedSales',
  'hasCustomerProfileSuggestions', 'getBranchTransactions', 'getFilteredTransactions',
  'getAvailableFloristById', 'createDefaultScheduleForEmployee', 'hasActiveOrderPointEntry',
  'isBankTransferOrder', 'getMostUsedBranchFromOrders', 'getRevenueSummaryFromOrders',
  'getRevenueTrendByRange', 'getInTransitStock', 'getAllowedStockTransferStatuses',
  'canAccessFinanceWorkspaceModule', 'getAvailableFloristsForOrder',
  'suggestedAttendancePenaltyPoints', 'getFinanceOverview', 'getFinanceQueueRevenueIdr',
  'getVoidedRevenueIdr', 'getRefundExposureIdr', 'sumOrderTotalsIdr',
  'reconcileFinanceTotals', 'getOrderItemCount', 'isActiveOperationalOrder',
  'hasPendingChangeRequest',
]

const failures = []
for (const relative of retiredFiles) {
  if (fs.existsSync(path.join(sourceRoot, relative))) failures.push(`Retired file still exists: ${relative}`)
}

const files = []
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
}
walk(sourceRoot)

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  for (const symbol of retiredExports) {
    const pattern = new RegExp(`export\\s+(?:const|function|class|interface|type)\\s+${symbol}\\b`)
    if (pattern.test(content)) failures.push(`Retired export ${symbol} found in ${path.relative(root, file)}`)
  }
}

const revenueBarrel = fs.readFileSync(path.join(sourceRoot, 'domain/revenueDomain.ts'), 'utf8')
if (/revenueCompareDomain|revenueBreakdownDomain/.test(revenueBarrel)) {
  failures.push('Revenue barrel still exposes an abandoned order-based domain')
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`Architecture check passed: ${retiredExports.length} retired exports remain absent.`)
