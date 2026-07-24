import { describe, expect, it } from 'vitest'
import { getOpeningHourTimeSlots, isTimeWithinBranchOpeningHours } from './branchOpeningHoursDomain'
import type { BranchSettings } from '../types/settings'

const branch: BranchSettings = {
  id: 'test', name: 'Test', code: 'TST', address: '', phone: '', isActive: true,
  openingHours: {
    monday: { isOpen: true, opensAt: '10:00', closesAt: '12:00' },
    tuesday: { isOpen: false, opensAt: '10:00', closesAt: '12:00' },
    wednesday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    thursday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    friday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    saturday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
    sunday: { isOpen: true, opensAt: '09:00', closesAt: '18:00' },
  },
}

describe('branch opening hours', () => {
  it('returns only slots within the configured window', () => {
    const slots = getOpeningHourTimeSlots(branch, '2026-07-13')
    expect(slots[0]).toBe('10:00')
    expect(slots.at(-1)).toBe('12:00')
    expect(slots).not.toContain('09:45')
  })
  it('returns no slots on a closed day', () => {
    expect(getOpeningHourTimeSlots(branch, '2026-07-14')).toEqual([])
  })
  it('accepts boundary times and rejects outside times', () => {
    expect(isTimeWithinBranchOpeningHours(branch, '2026-07-13', '10:00')).toBe(true)
    expect(isTimeWithinBranchOpeningHours(branch, '2026-07-13', '12:00')).toBe(true)
    expect(isTimeWithinBranchOpeningHours(branch, '2026-07-13', '12:15')).toBe(false)
  })
})
