import type { OrderTableRow } from '../types/orders'
import { nowInJakarta } from './orderTimingDomain'

export const ORDER_SLOT_INTERVAL_MINUTES = 15
export const ORDER_SLOT_MIN_LEAD_MINUTES = 45
export const ORDER_SLOT_CAPACITY = 3

const OCCUPYING_STATUSES = new Set<OrderTableRow['status']>([
  'pending_verification',
  'confirmed',
  'processing',
  'ready',
  'delivering',
])

const normalizeTime = (value: string): string => value.slice(0, 5)

export const buildOrderSlotDateTime = (date: string, time: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}/.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = normalizeTime(time).split(':').map(Number)
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

export const isOrderSlotAligned = (time: string): boolean => {
  const match = normalizeTime(time).match(/^(\d{2}):(\d{2})$/)
  if (!match) return false
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && minute % ORDER_SLOT_INTERVAL_MINUTES === 0
}

export const isOrderSlotTooSoon = (
  date: string,
  time: string,
  now: Date = nowInJakarta(),
): boolean => {
  const slot = buildOrderSlotDateTime(date, time)
  if (!slot) return true
  return slot.getTime() <= now.getTime() + ORDER_SLOT_MIN_LEAD_MINUTES * 60_000
}

export const orderOccupiesScheduleCapacity = (order: Pick<OrderTableRow, 'status'>): boolean =>
  OCCUPYING_STATUSES.has(order.status)

export const countOrdersInSlot = (
  orders: OrderTableRow[],
  branchId: string,
  date: string,
  time: string,
  excludeOrderId?: string,
): number => {
  const normalizedTime = normalizeTime(time)
  return orders.filter((order) =>
    order.id !== excludeOrderId &&
    order.branch === branchId &&
    order.scheduleDate === date &&
    normalizeTime(order.scheduleTime ?? '') === normalizedTime &&
    orderOccupiesScheduleCapacity(order),
  ).length
}

export const isOrderSlotFull = ({
  orders,
  branchId,
  date,
  time,
  fullSlots = [],
  excludeOrderId,
}: {
  orders: OrderTableRow[]
  branchId: string
  date: string
  time: string
  fullSlots?: string[]
  excludeOrderId?: string
}): boolean => {
  const normalizedTime = normalizeTime(time)
  return fullSlots.some((slot) => normalizeTime(slot) === normalizedTime) ||
    countOrdersInSlot(orders, branchId, date, normalizedTime, excludeOrderId) >= ORDER_SLOT_CAPACITY
}

export const getAvailableOrderSlots = ({
  openingSlots,
  date,
  branchId,
  orders = [],
  fullSlots = [],
  now = nowInJakarta(),
}: {
  openingSlots: string[]
  date: string
  branchId: string
  orders?: OrderTableRow[]
  fullSlots?: string[]
  now?: Date
}): string[] => openingSlots.filter((time) =>
  isOrderSlotAligned(time) &&
  !isOrderSlotTooSoon(date, time, now) &&
  !isOrderSlotFull({ orders, branchId, date, time, fullSlots }),
)

export type OrderSlotValidationCode = 'interval' | 'too_soon' | 'full'

export const validateOrderSlot = ({
  date,
  time,
  branchId,
  orders = [],
  fullSlots = [],
  now = nowInJakarta(),
  excludeOrderId,
}: {
  date: string
  time: string
  branchId: string
  orders?: OrderTableRow[]
  fullSlots?: string[]
  now?: Date
  excludeOrderId?: string
}): OrderSlotValidationCode | null => {
  if (!isOrderSlotAligned(time)) return 'interval'
  if (isOrderSlotTooSoon(date, time, now)) return 'too_soon'
  if (isOrderSlotFull({ orders, branchId, date, time, fullSlots, excludeOrderId })) return 'full'
  return null
}

export const getOrderSlotValidationMessage = (code: OrderSlotValidationCode): string => {
  if (code === 'interval') return 'Choose a time in 15-minute intervals.'
  if (code === 'full') return 'That time is already full. Please choose another pickup or delivery time.'
  return 'That time is now within the 45-minute preparation window. Please choose a later time.'
}

export const getOrderSlotErrorMessage = (error: unknown): string | null => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (message.includes('ORDER_SLOT_FULL')) return getOrderSlotValidationMessage('full')
  if (message.includes('ORDER_SLOT_INTERVAL_INVALID')) return getOrderSlotValidationMessage('interval')
  if (message.includes('ORDER_SLOT_TOO_SOON')) return getOrderSlotValidationMessage('too_soon')
  return null
}
