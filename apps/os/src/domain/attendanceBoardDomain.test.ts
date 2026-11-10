import { describe, expect, it } from 'vitest'
import { getAttendanceBoardState, groupAttendanceBoard, summarizeAttendanceBoard, type AttendanceBoardEntry } from './attendanceBoardDomain'

const entry = (patch: Partial<AttendanceBoardEntry>): AttendanceBoardEntry => ({
  employeeId: 'e', displayName: 'Staf', role: 'florist', scheduled: true, isWorking: true, scheduledBranchId: 'Kedamaian',
  shiftStart: '08:00', shiftEnd: '16:00', status: null, source: null, checkInAt: null, checkOutAt: null,
  checkInBranchName: null, checkInPhotoPath: null, checkOutPhotoPath: null, ...patch,
})

describe('attendance photo board', () => {
  it('derives what the manager needs to see per person', () => {
    expect(getAttendanceBoardState(entry({}))).toBe('not_checked_in')
    expect(getAttendanceBoardState(entry({ status: 'present', checkInAt: '2026-11-10T01:00:00Z' }))).toBe('on_time')
    expect(getAttendanceBoardState(entry({ status: 'late', checkInAt: '2026-11-10T02:00:00Z' }))).toBe('late')
    expect(getAttendanceBoardState(entry({ isWorking: false }))).toBe('off')
    expect(getAttendanceBoardState(entry({ scheduled: false, isWorking: false, scheduledBranchId: null }))).toBe('unscheduled')
    expect(getAttendanceBoardState(entry({ status: 'leave' }))).toBe('leave')
  })

  it('groups by branch and counts who is still missing', () => {
    const entries = [
      entry({ employeeId: 'a', displayName: 'Zahra', scheduledBranchId: 'Pahoman' }),
      entry({ employeeId: 'b', displayName: 'Ani', status: 'late', checkInAt: 'x' }),
      entry({ employeeId: 'c', displayName: 'Budi', status: 'present', checkInAt: 'x' }),
      entry({ employeeId: 'd', displayName: 'Citra', scheduled: false, isWorking: false, scheduledBranchId: null }),
    ]
    const groups = groupAttendanceBoard(entries)
    expect(groups.map((group) => group.branch)).toEqual(['Kedamaian', 'Pahoman', ''])
    expect(groups[0].entries.map((item) => item.displayName)).toEqual(['Ani', 'Budi'])
    expect(summarizeAttendanceBoard(entries)).toEqual({ expected: 3, checkedIn: 2, late: 1, notCheckedIn: 1 })
  })
})
