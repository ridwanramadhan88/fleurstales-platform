import { describe, expect, it } from 'vitest'
import { getHrHomeWork, getMyDayStatus } from './homeWorkDomain'

const shift = (isWorking: boolean) => ({ isWorking, branchId: 'Kedamaian', startTime: '08:00', endTime: '16:00' }) as never

describe('my day status', () => {
  const base = { employeeId: 'e1', today: '2026-10-03' }
  it('is "not checked in" with the shift when the shift has started', () => {
    expect(getMyDayStatus({ ...base, attendance: [], overrides: [{ employeeId: 'e1', date: '2026-10-03', shift: shift(true) }] }))
      .toEqual({ attendance: 'not_checked_in', shift: { branchId: 'Kedamaian', startTime: '08:00', endTime: '16:00' } })
  })
  it('follows check-in and check-out', () => {
    const overrides = [{ employeeId: 'e1', date: '2026-10-03', shift: shift(true) }]
    expect(getMyDayStatus({ ...base, overrides, attendance: [{ employeeId: 'e1', date: '2026-10-03', checkInAt: '2026-10-03T01:05:00Z' }] }).attendance).toBe('checked_in')
    expect(getMyDayStatus({ ...base, overrides, attendance: [{ employeeId: 'e1', date: '2026-10-03', checkInAt: 'a', checkOutAt: 'b' }] }).attendance).toBe('done')
  })
  it('is a day off when the schedule says so', () => {
    expect(getMyDayStatus({ ...base, attendance: [], overrides: [{ employeeId: 'e1', date: '2026-10-03', shift: shift(false) }] }).attendance).toBe('off')
  })
})

describe('HR home work', () => {
  it('counts open attendance cases, staff missing a day this week, and the latest payroll status', () => {
    const work = getHrHomeWork({
      reviewCases: [{ status: 'pending' }, { status: 'problem' }, { status: 'resolved' }] as never,
      employees: [
        { id: 'a', status: 'active', systemRole: 'admin' },
        { id: 'b', status: 'active', systemRole: 'florist' },
        { id: 'o', status: 'active', systemRole: 'owner' },
        { id: 'x', status: 'inactive', systemRole: 'florist' },
      ] as never,
      overrides: [{ employeeId: 'a', date: '2026-10-05' }, { employeeId: 'a', date: '2026-10-06' }],
      weekDates: ['2026-10-05', '2026-10-06'],
      payrollProposals: [{ status: 'draft', createdAt: '2026-09-01' }, { status: 'submitted_to_finance', createdAt: '2026-10-01' }] as never,
    })
    expect(work).toEqual({ attendanceToReview: 2, unscheduledStaff: 1, payrollStatus: 'submitted_to_finance' })
  })
  it('says payroll is not created when there is no proposal', () => {
    expect(getHrHomeWork({ reviewCases: [], employees: [], overrides: [], weekDates: [], payrollProposals: [] }).payrollStatus).toBeNull()
  })
})
