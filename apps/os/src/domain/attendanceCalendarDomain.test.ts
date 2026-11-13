import { describe, expect, it } from 'vitest'
import { buildAttendanceCalendar, getMonthDates, shiftMonth } from './attendanceCalendarDomain'
import type { AttendanceRecord, AttendanceReviewCase, Employee } from '../store/hrStoreTypes'

const rina = { id: 'e1', name: 'Rina', systemRole: 'florist', status: 'active' } as Employee
const record = (date: string, status: AttendanceRecord['status']): AttendanceRecord => ({ id: `${date}-${status}`, employeeId: 'e1', date, status, actor: 'Rina', createdAt: `${date}T01:00:00Z` })
const reviewCase = (date: string, status: AttendanceReviewCase['status'], extra: Partial<AttendanceReviewCase> = {}) =>
  ({ id: `${date}-${status}`, attendanceId: 'a', employeeId: 'e1', date, warningType: 'late_check_in', status, reason: '', createdAt: date, ...extra }) as AttendanceReviewCase

describe('attendance calendar', () => {
  const dates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']
  const working = { branchId: 'kdm', startTime: '08:00', endTime: '16:00' }
  const calendar = buildAttendanceCalendar({
    employees: [rina],
    dates,
    today: '2026-11-12',
    attendance: [record('2026-11-09', 'present'), record('2026-11-10', 'late')],
    reviewCases: [
      reviewCase('2026-11-10', 'pending'),
      reviewCase('2026-11-09', 'accepted', { warningType: 'overtime', approvedOvertimeMinutes: 90 }),
    ],
    getShift: (_employee, date) => date === '2026-11-13' || date === '2026-11-12' || date < '2026-11-12' ? working : null,
  })

  it('gives every day one state: recorded, missing, not yet, planned, or off', () => {
    expect(calendar.rows[0].cells.map((cell) => cell.state)).toEqual(['present', 'late', 'missing', 'not_yet', 'planned'])
  })

  it('marks open review items per cell and totals them', () => {
    expect(calendar.rows[0].cells[1].pendingCases).toHaveLength(1)
    expect(calendar.rows[0].cells[0].resolvedCases).toHaveLength(1)
    expect(calendar.pendingTotal).toBe(1)
  })

  it('totals late, absent (incl. no record) and approved overtime per employee and per day', () => {
    expect(calendar.rows[0].totals).toEqual({ present: 1, late: 1, absent: 1, overtimeMinutes: 90, pending: 1 })
    expect(calendar.columns[2]).toMatchObject({ date: '2026-11-11', absent: 1 })
  })

  it('lists month dates and moves months', () => {
    expect(getMonthDates('2026-02-14')).toHaveLength(28)
    expect(getMonthDates('2026-11-12')[29]).toBe('2026-11-30')
    expect(shiftMonth('2026-12-20', 1)).toBe('2027-01-01')
    expect(shiftMonth('2026-01-05', -1)).toBe('2025-12-01')
  })
})
