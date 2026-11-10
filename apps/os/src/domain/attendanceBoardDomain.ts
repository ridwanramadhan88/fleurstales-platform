import type { UserRole } from '../store/userStore'

/** One staff member on the daily attendance photo board (server shape). */
export interface AttendanceBoardEntry {
  employeeId: string
  displayName: string
  role: UserRole
  scheduled: boolean
  isWorking: boolean
  scheduledBranchId: string | null
  shiftStart: string | null
  shiftEnd: string | null
  status: 'present' | 'late' | 'absent' | 'leave' | null
  source: string | null
  checkInAt: string | null
  checkOutAt: string | null
  checkInBranchName: string | null
  checkInPhotoPath: string | null
  checkOutPhotoPath: string | null
}

export type AttendanceBoardState = 'on_time' | 'late' | 'not_checked_in' | 'off' | 'leave' | 'absent' | 'unscheduled'

export const getAttendanceBoardState = (entry: AttendanceBoardEntry): AttendanceBoardState => {
  if (entry.status === 'leave') return 'leave'
  if (entry.status === 'absent') return 'absent'
  if (entry.checkInAt || entry.status === 'present' || entry.status === 'late') return entry.status === 'late' ? 'late' : 'on_time'
  if (entry.scheduled && !entry.isWorking) return 'off'
  if (!entry.scheduled) return 'unscheduled'
  return 'not_checked_in'
}

export interface AttendanceBoardGroup {
  branch: string
  entries: AttendanceBoardEntry[]
}

const UNASSIGNED = ''

/** Group by the branch the person is scheduled at, falling back to where they checked in. */
export const groupAttendanceBoard = (entries: AttendanceBoardEntry[]): AttendanceBoardGroup[] => {
  const groups = new Map<string, AttendanceBoardEntry[]>()
  for (const entry of entries) {
    const branch = (entry.isWorking ? entry.scheduledBranchId : null) ?? entry.checkInBranchName ?? entry.scheduledBranchId ?? UNASSIGNED
    groups.set(branch, [...(groups.get(branch) ?? []), entry])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)))
    .map(([branch, items]) => ({ branch, entries: items.sort((a, b) => a.displayName.localeCompare(b.displayName)) }))
}

export interface AttendanceBoardSummary {
  expected: number
  checkedIn: number
  late: number
  notCheckedIn: number
}

export const summarizeAttendanceBoard = (entries: AttendanceBoardEntry[]): AttendanceBoardSummary => {
  const states = entries.map(getAttendanceBoardState)
  const late = states.filter((state) => state === 'late').length
  const onTime = states.filter((state) => state === 'on_time').length
  const notCheckedIn = states.filter((state) => state === 'not_checked_in').length
  return { expected: entries.filter((entry) => entry.scheduled && entry.isWorking).length, checkedIn: late + onTime, late, notCheckedIn }
}
