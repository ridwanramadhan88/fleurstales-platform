import { describe, expect, it } from 'vitest'
import {
  daysSince,
  financeBusinessDate,
  financeBusinessMonth,
  formatMonthKey,
  jakartaDateKey,
  jakartaMonthKey,
  nextMonthKey,
  previousMonthKey,
  recentMonthKeys,
} from './financeDates'

describe('finance dates (WIB)', () => {
  it('keys a UTC timestamp by its Jakarta month and day', () => {
    // 31 Oct 20:00 UTC is already 1 Nov 03:00 in Jakarta.
    expect(jakartaMonthKey('2026-10-31T20:00:00.000Z')).toBe('2026-11')
    expect(jakartaDateKey('2026-10-31T20:00:00.000Z')).toBe('2026-11-01')
    expect(jakartaMonthKey('not a date')).toBe('')
  })

  it('uses the transaction date before the creation time', () => {
    const row = { transactionDate: '2026-09-30T23:30:00+07:00', createdAt: '2026-10-02T01:00:00.000Z' }
    expect(financeBusinessMonth(row)).toBe('2026-09')
    expect(financeBusinessDate(row)).toBe('2026-09-30')
  })

  it('steps months across year boundaries', () => {
    expect(previousMonthKey('2026-01')).toBe('2025-12')
    expect(nextMonthKey('2026-12')).toBe('2027-01')
    expect(recentMonthKeys(3, '2026-02')).toEqual(['2026-02', '2026-01', '2025-12'])
  })

  it('formats a month in either language', () => {
    expect(formatMonthKey('2026-11', 'en')).toBe('November 2026')
    expect(formatMonthKey('2026-08', 'id')).toBe('Agustus 2026')
  })

  it('counts whole WIB days since a timestamp', () => {
    const now = new Date('2026-11-16T03:00:00.000Z')
    expect(daysSince('2026-11-16T00:30:00+07:00', now)).toBe(0)
    expect(daysSince('2026-11-13T23:00:00+07:00', now)).toBe(3)
    expect(daysSince(undefined, now)).toBe(0)
  })
})
