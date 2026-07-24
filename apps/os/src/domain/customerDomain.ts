/**
 * @file customerDomain.ts
 * @description Domain layer for Customers / CRM.
 * Contains all business logic built on top of:
 * - Customer profiles from customerStore.
 * - Orders from ordersStore.
 *
 * Responsibilities:
 * - Customer metrics (lifetime spend, order count, recency, AOV, branches).
 * - Segmentation (VIP / regular / new).
 * - Activity level (active / inactive).
 * - Value score (combined spend, frequency, recency).
 * - Filtering and sorting for CRM views.
 * - Top customers ranking.
 *
 * UI and stores must not re-implement these rules.
 */

import type { OrderTableRow, BranchId } from '../types/orders'
import type {
  CustomerProfile,
  CustomerSegmentRules,
} from '../store/customerStoreTypes'
import { DEFAULT_SEGMENT_RULES } from '../store/customerStore'

/**
 * @description Customer behavioural/value segment.
 */
export type CustomerSegment = 'vip' | 'regular' | 'new'

/**
 * @description Customer activity level based on recency.
 */
export type CustomerActivityLevel = 'active' | 'inactive'

/**
 * @description Filter values used in the Customers UI.
 */
export type CustomerSegmentFilter = 'all' | CustomerSegment

/**
 * @description Sort options exposed in the Customers UI.
 */
export type CustomerSortOption =
  | 'most_recent'
  | 'highest_spend'
  | 'most_orders'
  | 'name_az'

/**
 * @description Metrics derived for a single customer from Orders data.
 */
export interface CustomerMetrics {
  /** Total IDR spend across all linked orders. */
  lifetimeSpend: number
  /** Number of orders linked to this customer. */
  orderCount: number
  /** Label for the last order's date (for display). */
  lastOrderDateLabel: string | null
  /** Optional internal timestamp for sorting by recency. */
  lastOrderTimestamp: number | null
  /** Average order value in IDR (rounded), or null if no orders. */
  averageOrderValue: number | null
  /** Branch used most often by this customer, if any. */
  mostUsedBranch: BranchId | null
  /** Segment bucket (VIP / regular / new). */
  segment: CustomerSegment
}

/**
 * @description Enriched customer profile with metrics and search haystack.
 */
export interface EnrichedCustomer {
  profile: CustomerProfile
  metrics: CustomerMetrics
  /** Lowercased search string for fast filtering. */
  haystack: string
}

/**
 * @description Returns the customer segment based on lifetime spend and
 * order count:
 * - VIP: meets the configured VIP rule (see CustomerSegmentRules — owner
 *   editable in the Customers tab, defaults to spend > Rp 1,000,000).
 * - regular: has spent something but doesn't meet the VIP rule.
 * - new: no spend at all.
 */
export const getCustomerSegment = (
  lifetimeSpend: number,
  orderCount = 0,
  rules: CustomerSegmentRules = DEFAULT_SEGMENT_RULES,
): CustomerSegment => {
  const meetsSpend = lifetimeSpend >= rules.minLifetimeSpend
  const meetsOrders = orderCount >= rules.minOrderCount

  const isVip =
    rules.mode === 'spend'
      ? meetsSpend
      : rules.mode === 'orders'
        ? meetsOrders
        : rules.mode === 'both'
          ? meetsSpend && meetsOrders
          : meetsSpend || meetsOrders

  if (isVip) return 'vip'
  if (lifetimeSpend > 0) return 'regular'
  return 'new'
}

/**
 * @description Returns whether an order belongs to a CRM profile. New orders
 * use the stable customer id; legacy orders fall back to the display name.
 */
const orderBelongsToCustomer = (
  order: OrderTableRow,
  customer: CustomerProfile,
): boolean =>
  order.customerId
    ? order.customerId === customer.id
    : order.customerName === customer.name

/**
 * @description Returns all orders that belong to a specific customer profile.
 */
export const getOrdersForCustomer = (
  customer: CustomerProfile,
  allOrders: OrderTableRow[],
): OrderTableRow[] =>
  allOrders.filter((order) => orderBelongsToCustomer(order, customer))

/**
 * @description Resolves current CRM contact data for an order, with the
 * immutable order snapshot as a fallback when the profile is unavailable.
 */
export const getCustomerContactForOrder = (
  customers: CustomerProfile[],
  order: OrderTableRow,
): CustomerProfile | OrderTableRow['customerSnapshot'] | undefined => {
  const current = order.customerId
    ? customers.find((customer) => customer.id === order.customerId)
    : customers.find((customer) => customer.name === order.customerName)
  if (current) return current
  if (!order.customerSnapshot) return undefined
  return {
    ...order.customerSnapshot,
    whatsappNumber:
      order.customerSnapshot.whatsappNumber ?? order.customerSnapshot.phone ?? '',
  }
}

/** Resolves the current WhatsApp number while preserving legacy phone snapshots. */
export const getCustomerWhatsappNumber = (
  customer:
    | CustomerProfile
    | NonNullable<OrderTableRow['customerSnapshot']>
    | null
    | undefined,
): string => customer?.whatsappNumber ?? customer?.phone ?? ''

/**
 * @description Internal helper to derive most used branch from a list of orders.
 */
const getMostUsedBranchInternal = (
  orders: OrderTableRow[],
): BranchId | null => {
  const counters: Record<BranchId, number> = {}

  orders.forEach((order) => {
    counters[order.branch] = (counters[order.branch] ?? 0) + 1
  })

  const entries = Object.entries(counters)
  if (entries.length === 0) return null

  return entries.reduce((best, current) => (current[1] > best[1] ? current : best))[0]
}

/**
 * @description Attempts to parse a createdAt label into a Date for recency sorting.
 * Falls back to null if parsing fails.
 */
const parseOrderCreatedAt = (label: string | undefined): Date | null => {
  if (!label) return null
  const trimmed = label.split('·')[0].trim()
  if (!trimmed) return null
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

/**
 * @description Builds metrics for a single customer from their orders.
 */
export const buildCustomerMetrics = (
  orders: OrderTableRow[],
  rules: CustomerSegmentRules = DEFAULT_SEGMENT_RULES,
): CustomerMetrics => {
  const orderCount = orders.length
  const lifetimeSpend = orders.reduce(
    (sum, order) => sum + order.totalIdr,
    0,
  )

  const averageOrderValue =
    orderCount > 0 ? Math.round(lifetimeSpend / orderCount) : null

  let lastOrderDateLabel: string | null = null
  let lastOrderTimestamp: number | null = null

  if (orders.length > 0) {
    // Assume orders are not guaranteed sorted; pick the most recent by parsed date.
    let latestTime = -Infinity

    orders.forEach((order) => {
      const date = parseOrderCreatedAt(order.createdAtLabel)
      const timestamp = date ? date.getTime() : 0
      if (timestamp >= latestTime) {
        latestTime = timestamp
        lastOrderDateLabel = order.createdAtLabel
        lastOrderTimestamp = latestTime
      }
    })
  }

  const mostUsedBranch = getMostUsedBranchInternal(orders)
  const segment = getCustomerSegment(lifetimeSpend, orderCount, rules)

  return {
    lifetimeSpend,
    orderCount,
    lastOrderDateLabel,
    lastOrderTimestamp,
    averageOrderValue,
    mostUsedBranch,
    segment,
  }
}

/**
 * @description Builds enriched customers (profile + metrics + haystack) from
 * raw customer profiles and orders.
 */
export const buildEnrichedCustomers = (
  customers: CustomerProfile[],
  allOrders: OrderTableRow[],
  rules: CustomerSegmentRules = DEFAULT_SEGMENT_RULES,
): EnrichedCustomer[] =>
  customers.map((profile) => {
    const orders = getOrdersForCustomer(profile, allOrders)
    const metrics = buildCustomerMetrics(orders, rules)
    const haystack = `${profile.name} ${profile.whatsappNumber} ${profile.email ?? ''}`
      .toLowerCase()
      .trim()

    return {
      profile,
      metrics,
      haystack,
    }
  })

/**
 * @description Filters and sorts enriched customers according to current CRM
 * search, segment filter, and sort option.
 */
export const filterAndSortCustomers = (
  customers: EnrichedCustomer[],
  searchQuery: string,
  segmentFilter: CustomerSegmentFilter,
  sortOption: CustomerSortOption,
): EnrichedCustomer[] => {
  const query = searchQuery.trim().toLowerCase()

  let result = customers.filter((item) => {
    if (segmentFilter !== 'all' && item.metrics.segment !== segmentFilter) {
      return false
    }

    if (!query) return true

    return item.haystack.includes(query)
  })

  result = [...result].sort((a, b) => {
    if (sortOption === 'highest_spend') {
      return b.metrics.lifetimeSpend - a.metrics.lifetimeSpend
    }

    if (sortOption === 'most_orders') {
      return b.metrics.orderCount - a.metrics.orderCount
    }

    if (sortOption === 'name_az') {
      return a.profile.name.localeCompare(b.profile.name)
    }

    // most_recent: use lastOrderTimestamp; customers without orders go last.
    const aTime = a.metrics.lastOrderTimestamp ?? -Infinity
    const bTime = b.metrics.lastOrderTimestamp ?? -Infinity
    return bTime - aTime
  })

  return result
}

/**
 * @description Overview metrics for the Customers CRM tab.
 */
export const computeCustomersOverview = (
  customers: EnrichedCustomer[],
): {
  totalCustomers: number
  vipCount: number
  totalLifetimeRevenue: number
  avgOrdersPerCustomer: number
} => {
  const totalCustomers = customers.length
  const vipCount = customers.filter(
    (item) => item.metrics.segment === 'vip',
  ).length

  const totalLifetimeRevenue = customers.reduce(
    (sum, item) => sum + item.metrics.lifetimeSpend,
    0,
  )

  const totalOrders = customers.reduce(
    (sum, item) => sum + item.metrics.orderCount,
    0,
  )

  const avgOrdersPerCustomer =
    totalCustomers > 0 ? totalOrders / totalCustomers : 0

  return {
    totalCustomers,
    vipCount,
    totalLifetimeRevenue,
    avgOrdersPerCustomer,
  }
}

/**
 * @description Returns the activity level for a customer based on their metrics:
 * - active: last order within the last 30 days.
 * - inactive: otherwise or no orders.
 */
export const getCustomerActivityLevel = (
  metrics: CustomerMetrics,
): CustomerActivityLevel => {
  if (metrics.lastOrderTimestamp == null) {
    return 'inactive'
  }

  const now = Date.now()
  const diffMs = now - metrics.lastOrderTimestamp
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000

  return diffMs <= thirtyDaysMs ? 'active' : 'inactive'
}

/**
 * @description Returns a numeric value score for a customer combining:
 * - Lifetime spend (weight on total value).
 * - Order frequency (number of orders).
 * - Recency (more recent orders score higher).
 *
 * This score is relative and not persisted; UI can only display it and MUST NOT
 * re-derive the logic.
 */
export const getCustomerValueScore = (
  metrics: CustomerMetrics,
): number => {
  const spendScore = Math.min(metrics.lifetimeSpend / 1_000_000, 5)
  const frequencyScore = Math.min(metrics.orderCount / 5, 5)

  let recencyScore = 0
  if (metrics.lastOrderTimestamp != null) {
    const now = Date.now()
    const diffDays =
      (now - metrics.lastOrderTimestamp) / (24 * 60 * 60 * 1000)

    if (diffDays <= 7) recencyScore = 5
    else if (diffDays <= 30) recencyScore = 4
    else if (diffDays <= 90) recencyScore = 3
    else if (diffDays <= 180) recencyScore = 2
    else recencyScore = 1
  }

  // Weighted sum: spend 40%, frequency 30%, recency 30%.
  const score =
    spendScore * 0.4 + frequencyScore * 0.3 + recencyScore * 0.3

  // Scale to 0–100 for easier reading.
  return Math.round((score / 5) * 100)
}
