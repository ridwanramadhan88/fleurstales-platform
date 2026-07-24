/**
 * @file orderTimingDomain.ts
 * @description Time/schedule-derived decisions for orders: current
 * wall-clock time in the business's operating timezone (Asia/Jakarta,
 * GMT+7), deriving an order's scheduled delivery/pickup date+time from its
 * schedule fields, and the urgency/priority buckets built on top of that
 * clock.
 *
 * This is the single source of truth for "what time is it for the
 * business" and "is this order late" — `orderTableFormatters.ts` used to
 * keep its own duplicate copy of the Jakarta-time helpers; it now imports
 * them from here instead.
 */

import type { OrderTableRow } from '../types/orders'
import type { Priority } from './shared/priority'

/**
 * @description Operational urgency buckets used across Orders surfaces.
 */
export type OrderUrgency = 'late' | 'dueSoon' | 'onTrack' | 'done'

/**
 * @description The business always operates on Indonesia (WIB / GMT+7) time,
 * regardless of the timezone the staff device happens to be set to. Rather
 * than trusting `new Date()` (which reflects the browser/device's local
 * timezone), this derives "now" in GMT+7 by reading the UTC wall-clock time
 * and adding the fixed 7-hour offset. The returned Date's local getters
 * (getHours/getDate/etc.) are then used as if they were GMT+7 getters — this
 * only works correctly if callers avoid mixing this with a device-local
 * `new Date()` elsewhere, which is why every "now" in this module goes
 * through this helper.
 */
export const toJakarta = (date: Date): Date => {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60 * 1000
  return new Date(utcMs + 7 * 60 * 60 * 1000)
}

export const nowInJakarta = (): Date => toJakarta(new Date())

export const getLocalDateString = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/**
 * @description Attempts to derive a plain `YYYY-MM-DD` date string from an
 * order's scheduled delivery/pickup fields, falling back to parsing
 * free-text schedule labels such as "Today · 19:00", "12 Apr 2026", or a
 * bare "16:00" (treated as today).
 */
export const parseOrderDateString = (order: OrderTableRow): string | undefined => {
  if (order.scheduleDate) return order.scheduleDate
  if (!order.scheduleLabel) return undefined

  const lower = order.scheduleLabel.toLowerCase()
  const today = nowInJakarta()

  if (lower.includes('today')) return getLocalDateString(today)
  if (lower.includes('tomorrow')) return getLocalDateString(addDays(today, 1))

  const match = order.scheduleLabel.match(/(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})/)
  if (match) {
    const day = Number(match[1])
    const year = Number(match[3])
    const months: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      mei: 4,
      jun: 5,
      jul: 6,
      ags: 7,
      aug: 7,
      sep: 8,
      okt: 9,
      oct: 9,
      nov: 10,
      des: 11,
      dec: 11,
    }
    const month = months[match[2].toLowerCase().substring(0, 3)]
    if (month !== undefined) {
      return getLocalDateString(new Date(year, month, day))
    }
  }

  // Many status-driven labels (e.g. "Pickup · 16:00", "Delivered · 18:45",
  // "Attempted · 19:30", "Was · 17:00") carry only a time, not an explicit
  // date or the word "today"/"tomorrow". These represent orders scheduled or
  // resolved on the current operating day, so treat a bare time-only label
  // as "today" rather than dropping the order from every date scope.
  const hasTimeOnly = /(\d{1,2})[:.](\d{2})/.test(order.scheduleLabel)
  if (hasTimeOnly) return getLocalDateString(today)

  return undefined
}

export const getOrderTimeString = (order: OrderTableRow): string => {
  if (order.scheduleTime) return order.scheduleTime
  const match = order.scheduleLabel?.match(/(\d{1,2})[:.](\d{2})/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

export const getOrderDateTime = (order: OrderTableRow): Date | null => {
  const dateString = parseOrderDateString(order)
  if (!dateString) return null

  const [year, month, day] = dateString.split('-').map(Number)
  const [hour = 0, minute = 0] = getOrderTimeString(order)
    .split(':')
    .map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

export const isFutureOrder = (order: OrderTableRow): boolean => {
  const orderDate = getOrderDateTime(order)
  if (!orderDate) return false

  const today = nowInJakarta()
  today.setHours(0, 0, 0, 0)

  const compareDate = new Date(orderDate)
  compareDate.setHours(0, 0, 0, 0)
  return compareDate > today
}

/**
 * @description Attempts to derive a scheduled Date from an order's
 * schedule-like label. Interprets the first "HH:MM" pattern in the label
 * as a time today.
 */
export const getScheduleDateFromLabel = (scheduleLabel?: string | null): Date | null => {
  if (!scheduleLabel) return null

  const match = scheduleLabel.match(/(\d{1,2})[:.](\d{2})/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }

  const scheduledAt = nowInJakarta()
  scheduledAt.setHours(hours, minutes, 0, 0)
  return scheduledAt
}

/**
 * @description Whether an order was completed (moved to ready / delivered /
 * picked_up) after its originally scheduled slot — used to keep the time
 * chip red even once the order is done, instead of switching to green,
 * when it finished late.
 */
export const wasCompletedLate = (order: OrderTableRow): boolean => {
  if (!order.completedAt) return false

  const scheduledAt =
    getOrderDateTime(order) ?? getScheduleDateFromLabel(order.scheduleLabel ?? null)
  if (!scheduledAt) return false

  return new Date(order.completedAt).getTime() > scheduledAt.getTime()
}

/**
 * @description Formats an order's `completedAt` ISO timestamp into a
 * "Today · HH.mm" / "Tomorrow · HH.mm" / "DD Mon · HH.mm" label, the same
 * shape used for schedule labels elsewhere — computed against Jakarta
 * (GMT+7) wall-clock time regardless of the viewing device's timezone.
 */
export const formatCompletionLabel = (completedAt: string): string => {
  const completedJakarta = toJakarta(new Date(completedAt))
  const today = nowInJakarta()

  const completedDateStr = getLocalDateString(completedJakarta)
  const todayStr = getLocalDateString(today)
  const tomorrowStr = getLocalDateString(addDays(today, 1))

  let dateLabel: string
  if (completedDateStr === todayStr) {
    dateLabel = 'Today'
  } else if (completedDateStr === tomorrowStr) {
    dateLabel = 'Tomorrow'
  } else {
    dateLabel = completedJakarta.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    })
  }

  const hh = String(completedJakarta.getHours()).padStart(2, '0')
  const mm = String(completedJakarta.getMinutes()).padStart(2, '0')
  return `${dateLabel} · ${hh}.${mm}`
}

export const formatOrderScheduleLabel = (
  fulfillment: OrderTableRow['fulfillment'],
  scheduleDate: string,
  scheduleTime: string,
): string | undefined => {
  if (!scheduleDate && !scheduleTime) return undefined

  const today = nowInJakarta()
  const todayStr = getLocalDateString(today)
  const tomorrowStr = getLocalDateString(addDays(today, 1))

  // Pickup orders are shown exactly like delivery orders — a plain
  // date/time label with no "Pickup"/"Delivery" prefix baked in. The
  // fulfillment type already has its own icon + text elsewhere in the row,
  // so repeating it here just added noise (and caused the mismatch where
  // pickup showed "Pickup · 16.00" while delivery showed "Today · 19.00").
  let dateLabel = scheduleDate
  if (scheduleDate === todayStr) {
    dateLabel = 'Today'
  } else if (scheduleDate === tomorrowStr) {
    dateLabel = 'Tomorrow'
  } else if (scheduleDate) {
    const [year, month, day] = scheduleDate.split('-').map(Number)
    dateLabel = new Date(year, month - 1, day).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    })
  } else {
    dateLabel = fulfillment === 'delivery' ? 'Delivery' : 'Pickup'
  }

  return scheduleTime ? `${dateLabel} · ${scheduleTime}` : dateLabel
}

/**
 * @description Resolves the label that should actually be shown for an
 * order's schedule. Seed/mock data sometimes bakes in a literal "Today" or
 * "Tomorrow" string alongside `scheduleDate` — that string goes stale the moment
 * the real calendar date moves on, which is exactly what produced the bug
 * where a 04 Jul order kept showing "Today" after today had become 05 Jul.
 * Whenever `scheduleDate` is available it is the source of truth, so we always
 * recompute the label from it against the real current date rather than
 * trusting whatever text happened to be stored.
 *
 * This is the single source of truth for "what schedule label should this
 * order show right now" — used by the Orders table/cards *and* by
 * `alertsDomain.ts` for notification messages, so a notification never
 * shows a raw, un-recomputed date (e.g. "2026-07-09") while the Orders list
 * shows "Today" for the same order.
 */
export const getDisplayScheduleLabel = (order: OrderTableRow): string | undefined => {
  // Once an order has actually finished (ready / delivered / picked_up),
  // show the real time it was marked as such instead of repeating the
  // original scheduled slot — that's what staff and customers actually
  // care about at that point.
  if (
    order.completedAt &&
    (order.status === 'ready' ||
      order.status === 'delivered' ||
      order.status === 'picked_up')
  ) {
    return formatCompletionLabel(order.completedAt)
  }

  if (order.scheduleDate) {
    return (
      formatOrderScheduleLabel(order.fulfillment, order.scheduleDate, getOrderTimeString(order)) ??
      order.scheduleLabel
    )
  }

  if (!order.scheduleLabel) return order.scheduleLabel

  // Older/mock data sometimes uses a generic "Requested · HH.mm" placeholder
  // instead of an actual date, which reads as a vague label rather than a
  // real schedule. Resolve it into a proper "Today"/"Tomorrow"/"DD Mon"
  // date label the same way a dated order would show, using the same
  // today-relative logic as parseOrderDateString.
  const requestedMatch = order.scheduleLabel.match(/^requested\s*·\s*(.+)$/i)
  if (requestedMatch) {
    const dateStr = parseOrderDateString(order)
    if (dateStr) {
      const today = nowInJakarta()
      const todayStr = getLocalDateString(today)
      const tomorrowStr = getLocalDateString(addDays(today, 1))
      let dateLabel: string
      if (dateStr === todayStr) {
        dateLabel = 'Today'
      } else if (dateStr === tomorrowStr) {
        dateLabel = 'Tomorrow'
      } else {
        const [year, month, day] = dateStr.split('-').map(Number)
        dateLabel = new Date(year, month - 1, day).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
        })
      }
      return `${dateLabel} · ${requestedMatch[1]}`
    }
  }

  return order.scheduleLabel
}

/**
 * @description Derives a time-until-delivery/pickup bucket for the order,
 * used to color the time chip. All comparisons are done against the current
 * time in GMT+7 (Asia/Jakarta), regardless of the staff device's timezone:
 * - Late (red): the scheduled slot has already passed, or the order is a
 *   terminal exception (cancelled/failed).
 * - Due soon (orange): the scheduled slot is less than 1 hour away.
 * - On track (no color): the scheduled slot is more than 1 hour away, or no
 *   schedule is available — still comfortably on time, so no color is
 *   needed to draw attention.
 * - Done (green): the order already reached a resolved state (ready,
 *   delivered, picked up) — once staff has acted, a passed scheduled slot
 *   is no longer meaningful, so these statuses are deliberately taken out
 *   of the clock entirely rather than falling through to "late".
 */
export const getOrderUrgency = (order: OrderTableRow): OrderUrgency => {
  if (order.status === 'failed' || order.status === 'cancelled') {
    return 'late'
  }

  if (
    order.status === 'ready' ||
    order.status === 'delivered' ||
    order.status === 'picked_up'
  ) {
    return wasCompletedLate(order) ? 'late' : 'done'
  }

  const scheduledAt =
    getOrderDateTime(order) ?? getScheduleDateFromLabel(order.scheduleLabel ?? null)
  if (!scheduledAt) {
    return 'onTrack'
  }

  const diffMs = scheduledAt.getTime() - nowInJakarta().getTime()
  if (diffMs <= 0) return 'late'
  return diffMs <= 60 * 60 * 1000 ? 'dueSoon' : 'onTrack'
}

/**
 * @description Returns the priority for an order based on time:
 * - late: the scheduled slot is in the past.
 * - due_soon: the scheduled slot is within the next 2 hours.
 * - normal: no schedule set, further in the future, or the order has
 *   already reached a resolved state (ready / delivering-complete /
 *   delivered / picked_up / cancelled / failed) where a passed scheduled
 *   slot no longer signals a problem.
 *
 * This function is pure and does not mutate any state.
 */
export const getOrderPriority = (order: OrderTableRow): Priority => {
  // Once an order is ready, delivered, picked up, cancelled, or failed, the
  // clock stops mattering: staff already acted (or the order was voided), so
  // a passed scheduled slot shouldn't keep surfacing it as "late".
  if (
    order.status === 'ready' ||
    order.status === 'delivered' ||
    order.status === 'picked_up' ||
    order.status === 'cancelled' ||
    order.status === 'failed'
  ) {
    return 'normal'
  }

  const scheduledAt =
    getOrderDateTime(order) ?? getScheduleDateFromLabel(order.scheduleLabel ?? null)
  if (!scheduledAt) {
    return 'normal'
  }

  const now = nowInJakarta()
  const diffMs = scheduledAt.getTime() - now.getTime()

  if (diffMs < 0) {
    return 'late'
  }

  const twoHoursMs = 2 * 60 * 60 * 1000
  if (diffMs <= twoHoursMs) {
    return 'due_soon'
  }

  return 'normal'
}

/** Requested pickup slot preserved independently from operational completion time. */
export const getRequestedPickupLabel = (order: OrderTableRow): string | undefined => {
  if (order.fulfillment !== 'pickup') return undefined
  const date = order.requestedPickupDate ?? order.scheduleDate ?? ''
  const time = order.requestedPickupTime ?? order.scheduleTime ?? getOrderTimeString(order)
  return formatOrderScheduleLabel('pickup', date, time) ?? order.scheduleLabel
}

/** Actual pickup timestamp, recorded only when the order enters picked_up. */
export const getActualPickupLabel = (order: OrderTableRow): string | undefined => {
  if (order.fulfillment !== 'pickup' || order.status !== 'picked_up') return undefined
  const actual = order.actualPickedUpAt ?? order.completedAt
  return actual ? formatCompletionLabel(actual) : undefined
}
