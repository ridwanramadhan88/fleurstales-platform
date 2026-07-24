import type { BranchOpeningHours, BranchSettings, DayOpeningHours, WeekdayKey } from '../types/settings'

export const WEEKDAY_KEYS: WeekdayKey[] = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
  friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
}

export const DEFAULT_BRANCH_OPENING_HOURS: BranchOpeningHours = {
  monday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
  tuesday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
  wednesday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
  thursday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
  friday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
  saturday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
  sunday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
}

const dateToWeekday = (date: string): WeekdayKey | null => {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return null
  const parsed = new Date(year, month - 1, day)
  if (Number.isNaN(parsed.getTime())) return null
  const map: WeekdayKey[] = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  return map[parsed.getDay()]
}

export const getBranchHoursForDate = (
  branch: Pick<BranchSettings, 'openingHours'> | null | undefined,
  date: string,
): DayOpeningHours | null => {
  const weekday = dateToWeekday(date)
  if (!weekday) return null
  return (branch?.openingHours ?? DEFAULT_BRANCH_OPENING_HOURS)[weekday]
}

const toMinutes = (value: string): number => {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

export const isTimeWithinBranchOpeningHours = (
  branch: Pick<BranchSettings, 'openingHours'> | null | undefined,
  date: string,
  time: string,
): boolean => {
  const hours = getBranchHoursForDate(branch, date)
  if (!hours?.isOpen || !time) return false
  const value = toMinutes(time)
  return value >= toMinutes(hours.opensAt) && value <= toMinutes(hours.closesAt)
}

export const getOpeningHourTimeSlots = (
  branch: Pick<BranchSettings, 'openingHours'> | null | undefined,
  date: string,
  minuteStep = 15,
): string[] => {
  const hours = getBranchHoursForDate(branch, date)
  if (!hours?.isOpen) return []
  const start = toMinutes(hours.opensAt)
  const end = toMinutes(hours.closesAt)
  const slots: string[] = []
  for (let value = start; value <= end; value += minuteStep) {
    const hour = Math.floor(value / 60)
    const minute = value % 60
    slots.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
  }
  return slots
}

export const describeBranchHoursForDate = (
  branch: Pick<BranchSettings, 'openingHours'> | null | undefined,
  date: string,
): string => {
  const hours = getBranchHoursForDate(branch, date)
  if (!hours) return 'Select a valid date.'
  if (!hours.isOpen) return 'Branch is closed on this day.'
  return `Available ${hours.opensAt}–${hours.closesAt}`
}
