/**
 * @file attendanceCalendarDomain.ts
 * @description One grid for HR: every employee × every date, so a whole week
 * or month of attendance (and what still needs review) can be read at once.
 * Pure functions; the component only renders what this returns.
 */

import type { AttendanceRecord, AttendanceReviewCase, Employee } from '../store/hrStoreTypes'

export type AttendanceCellState =
  | 'present'
  | 'late'
  | 'absent'
  | 'leave'
  /** Scheduled, the day is over, and nothing was recorded. */
  | 'missing'
  /** Scheduled today, not checked in yet. */
  | 'not_yet'
  /** Scheduled on a future date. */
  | 'planned'
  /** Not scheduled. */
  | 'off'

export interface AttendanceCalendarShift {
  branchId: string
  startTime: string
  endTime: string
}

export interface AttendanceCalendarCell {
  date: string
  state: AttendanceCellState
  shift: AttendanceCalendarShift | null
  record: AttendanceRecord | null
  /** Review cases still waiting for HR on this day. */
  pendingCases: AttendanceReviewCase[]
  /** Review cases already decided on this day. */
  resolvedCases: AttendanceReviewCase[]
  /** Overtime HR approved for this day, in minutes. */
  approvedOvertimeMinutes: number
}

export interface AttendanceCalendarRow {
  employee: Employee
  cells: AttendanceCalendarCell[]
  totals: { present: number; late: number; absent: number; overtimeMinutes: number; pending: number }
}

export interface AttendanceCalendarColumnTotal {
  date: string
  present: number
  late: number
  absent: number
  pending: number
}

export interface AttendanceCalendar {
  rows: AttendanceCalendarRow[]
  columns: AttendanceCalendarColumnTotal[]
  pendingTotal: number
}

const isPending = (item: Pick<AttendanceReviewCase, 'status'>) => item.status === 'pending' || item.status === 'problem'

const cellState = (record: AttendanceRecord | null, shift: AttendanceCalendarShift | null, date: string, today: string): AttendanceCellState => {
  if (record) return record.status
  if (!shift) return 'off'
  if (date > today) return 'planned'
  if (date === today) return 'not_yet'
  return 'missing'
}

export const buildAttendanceCalendar = ({
  employees,
  dates,
  today,
  attendance,
  reviewCases,
  getShift,
}: {
  employees: Employee[]
  dates: string[]
  today: string
  attendance: AttendanceRecord[]
  reviewCases: AttendanceReviewCase[]
  getShift: (employee: Employee, date: string) => AttendanceCalendarShift | null
}): AttendanceCalendar => {
  const recordByKey = new Map(attendance.map((record) => [`${record.employeeId}|${record.date}`, record]))
  const casesByKey = new Map<string, AttendanceReviewCase[]>()
  for (const item of reviewCases) {
    const key = `${item.employeeId}|${item.date}`
    casesByKey.set(key, [...(casesByKey.get(key) ?? []), item])
  }

  const rows = employees.map((employee): AttendanceCalendarRow => {
    const cells = dates.map((date): AttendanceCalendarCell => {
      const key = `${employee.id}|${date}`
      const record = recordByKey.get(key) ?? null
      const shift = getShift(employee, date)
      const cases = casesByKey.get(key) ?? []
      return {
        date,
        state: cellState(record, shift, date, today),
        shift,
        record,
        pendingCases: cases.filter(isPending),
        resolvedCases: cases.filter((item) => !isPending(item)),
        approvedOvertimeMinutes: cases
          .filter((item) => item.warningType === 'overtime' && item.status === 'accepted')
          .reduce((sum, item) => sum + (item.approvedOvertimeMinutes ?? 0), 0),
      }
    })
    return {
      employee,
      cells,
      totals: {
        present: cells.filter((cell) => cell.state === 'present').length,
        late: cells.filter((cell) => cell.state === 'late').length,
        absent: cells.filter((cell) => cell.state === 'absent' || cell.state === 'missing').length,
        overtimeMinutes: cells.reduce((sum, cell) => sum + cell.approvedOvertimeMinutes, 0),
        pending: cells.reduce((sum, cell) => sum + cell.pendingCases.length, 0),
      },
    }
  })

  const columns = dates.map((date, index): AttendanceCalendarColumnTotal => {
    const cells = rows.map((row) => row.cells[index])
    return {
      date,
      present: cells.filter((cell) => cell.state === 'present').length,
      late: cells.filter((cell) => cell.state === 'late').length,
      absent: cells.filter((cell) => cell.state === 'absent' || cell.state === 'missing').length,
      pending: cells.reduce((sum, cell) => sum + cell.pendingCases.length, 0),
    }
  })

  return { rows, columns, pendingTotal: rows.reduce((sum, row) => sum + row.totals.pending, 0) }
}

/** Dates of the calendar month that contains `date` (YYYY-MM-DD). */
export const getMonthDates = (date: string): string[] => {
  const [year, month] = date.split('-').map(Number)
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: days }, (_, index) => `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`)
}

/** Moves a YYYY-MM-DD date by whole months, clamped to the first of the month. */
export const shiftMonth = (date: string, months: number): string => {
  const [year, month] = date.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1 + months, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`
}
