/**
 * @file orderIssueDomain.ts
 * @description Order issues ("kendala") and late-order summaries for the
 * Manager's operations board. Pure helpers; the server computes lateness.
 */

export type OrderIssueKind = 'late_production' | 'late_courier' | 'stock_out' | 'complaint' | 'wrong_product' | 'other'

export const ORDER_ISSUE_KINDS: ReadonlyArray<{ id: OrderIssueKind; en: string; id_: string }> = [
  { id: 'late_production', en: 'Late production', id_: 'Produksi terlambat' },
  { id: 'late_courier', en: 'Late courier', id_: 'Kurir terlambat' },
  { id: 'stock_out', en: 'Stock ran out', id_: 'Stok kosong' },
  { id: 'complaint', en: 'Customer complaint', id_: 'Komplain pelanggan' },
  { id: 'wrong_product', en: 'Wrong product', id_: 'Produk salah' },
  { id: 'other', en: 'Other', id_: 'Lainnya' },
]

export const ORDER_ISSUE_NOTE_MIN = 3
export const ORDER_ISSUE_NOTE_MAX = 500

export interface LateOrder {
  orderId: string
  orderNumber: string
  branchId: string | null
  branchName: string | null
  fulfillment: 'pickup' | 'delivery'
  status: string
  dueAt: string
  handedAt: string | null
  minutesLate: number
  ongoing: boolean
  floristName: string | null
  courierName: string | null
  openIssues: number
}

export interface OrderIssue {
  id: string
  orderId: string
  orderNumber: string
  branchId: string | null
  branchName: string | null
  kind: OrderIssueKind
  note: string
  status: 'open' | 'resolved'
  reportedByName: string
  reportedByRole: string
  createdAt: string
  resolvedByName: string | null
  resolvedAt: string | null
  resolutionNote: string | null
}

export interface OperationsOverview {
  from: string
  to: string
  lateOrders: LateOrder[]
  issues: OrderIssue[]
}

export const getIssueKindLabel = (kind: OrderIssueKind, language: 'en' | 'id'): string => {
  const entry = ORDER_ISSUE_KINDS.find((item) => item.id === kind)
  if (!entry) return kind
  return language === 'id' ? entry.id_ : entry.en
}

/** "45 min" / "2 h 5 min" (en) or "45 mnt" / "2 j 5 mnt" (id). */
export const formatLateness = (minutes: number, language: 'en' | 'id'): string => {
  const total = Math.max(0, Math.round(minutes))
  const hourUnit = language === 'id' ? 'j' : 'h'
  const minuteUnit = language === 'id' ? 'mnt' : 'min'
  if (total < 60) return `${total} ${minuteUnit}`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours} ${hourUnit}` : `${hours} ${hourUnit} ${rest} ${minuteUnit}`
}

export interface LateSummary {
  total: number
  ongoing: number
  averageMinutes: number
  worstMinutes: number
}

export const summarizeLateOrders = (orders: LateOrder[]): LateSummary => {
  if (orders.length === 0) return { total: 0, ongoing: 0, averageMinutes: 0, worstMinutes: 0 }
  const sum = orders.reduce((acc, order) => acc + order.minutesLate, 0)
  return {
    total: orders.length,
    ongoing: orders.filter((order) => order.ongoing).length,
    averageMinutes: Math.round(sum / orders.length),
    worstMinutes: Math.max(...orders.map((order) => order.minutesLate)),
  }
}

export interface LateGroup { name: string; count: number; averageMinutes: number }

/** Late orders per florist or courier, most first. Orders without a name are skipped. */
export const groupLateOrdersBy = (orders: LateOrder[], key: 'floristName' | 'courierName'): LateGroup[] => {
  const groups = new Map<string, number[]>()
  for (const order of orders) {
    const name = order[key]?.trim()
    if (!name) continue
    groups.set(name, [...(groups.get(name) ?? []), order.minutesLate])
  }
  return [...groups.entries()]
    .map(([name, minutes]) => ({ name, count: minutes.length, averageMinutes: Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) }))
    .sort((a, b) => b.count - a.count || b.averageMinutes - a.averageMinutes || a.name.localeCompare(b.name))
}

export const isValidIssueNote = (note: string): boolean => {
  const length = note.trim().length
  return length >= ORDER_ISSUE_NOTE_MIN && length <= ORDER_ISSUE_NOTE_MAX
}

/** Roles that may report an issue from an order. Mirrors report_order_issue on the server. */
export const canReportOrderIssue = (role: string | null | undefined): boolean =>
  role === 'owner' || role === 'admin' || role === 'florist' || role === 'manager'
