/**
 * @file newOrderWalkIn.ts
 * @description Defaults for a walk-in customer collecting at the counter.
 * The order cannot be timed "now": the database only accepts 15-minute
 * slots at least 45 minutes ahead. So a walk-in pickup gets the earliest
 * free slot today, shown on the form before it is saved.
 */

import type { BranchSettings } from '../../types/settings'
import type { OrderTableRow } from '../../types/orders'
import { getOpeningHourTimeSlots } from '../../domain/branchOpeningHoursDomain'
import { getAvailableOrderSlots } from '../../domain/orderScheduleAvailabilityDomain'
import { getLocalDateString, nowInJakarta } from '../../domain/orderTimingDomain'
import type { NewOrderFormValues } from './useNewOrderForm'

export const getWalkInPickupSlot = ({
  branch,
  branchId,
  orders,
  now = nowInJakarta(),
}: {
  branch: Pick<BranchSettings, 'openingHours'> | null | undefined
  branchId: string
  orders: OrderTableRow[]
  now?: Date
}): { pickupDate: string; pickupTime: string } | null => {
  const today = getLocalDateString(now)
  const [firstSlot] = getAvailableOrderSlots({
    openingSlots: getOpeningHourTimeSlots(branch, today),
    date: today,
    branchId,
    orders,
    now,
  })
  return firstSlot ? { pickupDate: today, pickupTime: firstSlot } : null
}

/**
 * Sensible starting values when the source switches to Walk-in. Only fields
 * the user has not touched yet are filled, so nothing they typed changes.
 */
export const applyWalkInDefaults = (values: NewOrderFormValues): NewOrderFormValues => {
  // Payment status stays unpaid: new orders always start unpaid and full
  // payment is confirmed in Process Order, before production starts.
  const fulfillmentType = values.fulfillmentType || 'pickup'
  return {
    ...values,
    orderType: 'walk_in',
    fulfillmentType,
    ...(fulfillmentType === 'pickup' && !values.paymentMethod ? { paymentMethod: 'cash' as const } : {}),
  }
}
