/**
 * @file orderWorkStageDomain.ts
 * @description Where an order stands in the Admin's work, and how urgent it
 * is. One definition for the Orders list, the Admin home queue and (later)
 * the order window, so every surface ranks orders the same way.
 *
 * Priority = time points + stage points (Owner decision, 8 Nov 2026):
 * - Orders that still have to be made (not confirmed, not paid, no florist)
 *   must start production `PRODUCTION_LEAD_MINUTES` before pickup/delivery,
 *   so their effective deadline is earlier than the scheduled time.
 * - Time points from minutes left until the effective deadline: late 1000,
 *   ≤60 800, ≤120 600, later today 300, tomorrow 100, otherwise 0.
 * - Stage points: ready to hand over 250, needs confirmation 220, payment
 *   200, assign florist 180, finish photo in 150.
 * - Ties: earliest effective deadline first.
 */

import type { OrderTableRow } from '../types/orders'
import { getLocalDateString, getOrderDateTime, nowInJakarta, addDays } from './orderTimingDomain'

/** Production time assumed for every product until per-type times exist. */
export const PRODUCTION_LEAD_MINUTES = 90

/** Orders whose time points reach this are shown above the "Berikutnya" line. */
export const URGENT_TIME_POINTS = 600

export type OrderWorkStage =
  /** Toko online order waiting for the Admin to review and confirm. */
  | 'confirm'
  /** Confirmed, payment not complete. */
  | 'payment'
  /** Paid, no florist yet. */
  | 'assign'
  /** Florist is working; nothing for the Admin to do. */
  | 'arranging'
  /** Florist uploaded the finish photo; Admin marks it ready. */
  | 'photo_in'
  /** Ready for pickup or delivery. */
  | 'handover'
  /** With the courier; waiting for delivery. */
  | 'delivering'
  | 'done'
  | 'cancelled'

export interface OrderWorkStageInfo {
  stage: OrderWorkStage
  /** True when the next step is the Admin's; false when someone else is working. */
  needsAdmin: boolean
  /** Stage points in the priority formula. */
  points: number
  /** Whether the order still has to be made (deadline moves earlier). */
  beforeProduction: boolean
}

const STAGE_INFO: Record<OrderWorkStage, Omit<OrderWorkStageInfo, 'stage'>> = {
  handover: { needsAdmin: true, points: 250, beforeProduction: false },
  confirm: { needsAdmin: true, points: 220, beforeProduction: true },
  payment: { needsAdmin: true, points: 200, beforeProduction: true },
  assign: { needsAdmin: true, points: 180, beforeProduction: true },
  photo_in: { needsAdmin: true, points: 150, beforeProduction: false },
  arranging: { needsAdmin: false, points: 0, beforeProduction: false },
  delivering: { needsAdmin: false, points: 0, beforeProduction: false },
  done: { needsAdmin: false, points: 0, beforeProduction: false },
  cancelled: { needsAdmin: false, points: 0, beforeProduction: false },
}

type StageInput = Pick<
  OrderTableRow,
  'status' | 'paymentStatus' | 'paidAmountIdr' | 'totalIdr' | 'florist' | 'floristAssignedEmployeeId' | 'finishPhotoUrl'
>

export const isOrderFullyPaid = (order: Pick<OrderTableRow, 'paymentStatus' | 'paidAmountIdr' | 'totalIdr'>): boolean =>
  order.paymentStatus === 'paid' && (order.paidAmountIdr ?? order.totalIdr) >= order.totalIdr

export const getOrderWorkStage = (order: StageInput): OrderWorkStage => {
  switch (order.status) {
    case 'pending_verification':
      return 'confirm'
    case 'confirmed':
      if (!isOrderFullyPaid(order)) return 'payment'
      return 'assign'
    case 'processing':
      return order.finishPhotoUrl ? 'photo_in' : 'arranging'
    case 'ready':
      return 'handover'
    case 'delivering':
      return 'delivering'
    case 'delivered':
    case 'picked_up':
      return 'done'
    default:
      return 'cancelled'
  }
}

export const getOrderWorkStageInfo = (order: StageInput): OrderWorkStageInfo => {
  const stage = getOrderWorkStage(order)
  return { stage, ...STAGE_INFO[stage] }
}

export type OrderTimeBucket = 'late' | 'within60' | 'within120' | 'today' | 'tomorrow' | 'later' | 'unscheduled'

const TIME_POINTS: Record<OrderTimeBucket, number> = {
  late: 1000,
  within60: 800,
  within120: 600,
  today: 300,
  tomorrow: 100,
  later: 0,
  unscheduled: 0,
}

export interface OrderPriority {
  stage: OrderWorkStage
  needsAdmin: boolean
  /** Scheduled pickup/delivery time (Jakarta wall clock), if known. */
  scheduledAt: Date | null
  /** When the Admin's step must be done: scheduled time minus production lead when not yet made. */
  deadline: Date | null
  /** Minutes from now to the deadline (negative when late). */
  minutesLeft: number | null
  timeBucket: OrderTimeBucket
  score: number
  /** Time points ≥ URGENT_TIME_POINTS. */
  urgent: boolean
}

export const getOrderPriority = (
  order: StageInput & Pick<OrderTableRow, 'scheduleDate' | 'scheduleTime' | 'scheduleLabel'>,
  now: Date = nowInJakarta(),
): OrderPriority => {
  const info = getOrderWorkStageInfo(order)
  const scheduledAt = getOrderDateTime(order as OrderTableRow)
  if (!scheduledAt) {
    return { stage: info.stage, needsAdmin: info.needsAdmin, scheduledAt: null, deadline: null, minutesLeft: null, timeBucket: 'unscheduled', score: info.points, urgent: false }
  }
  const deadline = new Date(scheduledAt.getTime() - (info.beforeProduction ? PRODUCTION_LEAD_MINUTES : 0) * 60_000)
  const minutesLeft = Math.floor((deadline.getTime() - now.getTime()) / 60_000)
  const scheduledDay = getLocalDateString(scheduledAt)
  const today = getLocalDateString(now)
  const tomorrow = getLocalDateString(addDays(now, 1))
  const timeBucket: OrderTimeBucket = minutesLeft < 0
    ? 'late'
    : minutesLeft <= 60
      ? 'within60'
      : minutesLeft <= 120
        ? 'within120'
        : scheduledDay <= today
          ? 'today'
          : scheduledDay === tomorrow
            ? 'tomorrow'
            : 'later'
  const timePoints = TIME_POINTS[timeBucket]
  return {
    stage: info.stage,
    needsAdmin: info.needsAdmin,
    scheduledAt,
    deadline,
    minutesLeft,
    timeBucket,
    score: timePoints + info.points,
    urgent: timePoints >= URGENT_TIME_POINTS,
  }
}

/** Highest score first; ties by earliest deadline; unscheduled last. */
export const compareOrderPriority = (a: OrderPriority, b: OrderPriority): number => {
  if (b.score !== a.score) return b.score - a.score
  const aTime = a.deadline?.getTime() ?? Number.POSITIVE_INFINITY
  const bTime = b.deadline?.getTime() ?? Number.POSITIVE_INFINITY
  return aTime - bTime
}

export interface PrioritizedOrder<T> {
  order: T
  priority: OrderPriority
}

export const prioritizeOrders = <T extends Parameters<typeof getOrderPriority>[0]>(
  orders: T[],
  now: Date = nowInJakarta(),
): PrioritizedOrder<T>[] =>
  orders
    .map((order) => ({ order, priority: getOrderPriority(order, now) }))
    .sort((a, b) => compareOrderPriority(a.priority, b.priority))

/** Orders with a note or greeting card the team must read. */
export const orderHasNote = (order: Pick<OrderTableRow, 'orderNote' | 'internalNote' | 'greetingMessage' | 'giftMessage'>): boolean =>
  Boolean((order.orderNote ?? order.internalNote)?.trim() || (order.greetingMessage ?? order.giftMessage)?.trim())

/** The Jakarta calendar day of an ISO timestamp, or null. */
export const jakartaDay = (iso?: string): string | null => {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/**
 * Delivered or picked up on this Jakarta day — the same rule as the Admin
 * home "finished today" card, so the card and the "Selesai hari ini" tab agree.
 */
export const isOrderFinishedOn = (order: Pick<OrderTableRow, 'status' | 'completedAt'>, day: string): boolean =>
  (order.status === 'delivered' || order.status === 'picked_up') && jakartaDay(order.completedAt) === day
