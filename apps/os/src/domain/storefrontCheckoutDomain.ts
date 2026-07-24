import type { BranchSettings } from '../types/settings'
import { getBranchHoursForDate, getOpeningHourTimeSlots, isTimeWithinBranchOpeningHours } from './branchOpeningHoursDomain'

export interface StorefrontCheckoutValidationInput {
  customerName: string
  whatsappNumber: string
  fulfillment: 'delivery' | 'pickup'
  deliveryAddress: string
  date: string
  time: string
  branch: BranchSettings | null | undefined
}

export const validateStorefrontCheckoutDetails = (
  input: StorefrontCheckoutValidationInput,
): string | null => {
  if (!input.customerName.trim() || !input.whatsappNumber.trim()) return 'Please fill in your name and WhatsApp number.'
  if (!input.branch?.isActive) return 'Please choose an available branch.'
  if (input.fulfillment === 'delivery' && !input.deliveryAddress.trim()) return 'Please add a delivery address.'
  if (!input.date) return input.fulfillment === 'delivery' ? 'Please choose a delivery date.' : 'Please choose a pickup date.'
  const hours = getBranchHoursForDate(input.branch, input.date)
  if (!hours?.isOpen) return 'The selected branch is closed on this date.'
  if (!input.time) return input.fulfillment === 'delivery' ? 'Please choose a delivery time.' : 'Please choose a pickup time.'
  if (!isTimeWithinBranchOpeningHours(input.branch, input.date, input.time)) return 'The selected time is outside the branch opening hours.'
  return null
}

export const getStorefrontAvailableTimeSlots = (
  branch: BranchSettings | null | undefined,
  date: string,
): string[] => getOpeningHourTimeSlots(branch, date)

export const isStorefrontDateUnavailable = (
  branch: BranchSettings | null | undefined,
  date: Date,
): boolean => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const candidate = new Date(date)
  candidate.setHours(0, 0, 0, 0)
  if (candidate < today) return true
  const value = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`
  return !getBranchHoursForDate(branch, value)?.isOpen
}
