/**
 * @file MyDayStrip.tsx
 * @description Staff attendance and today's shift as one line on the home
 * screen ("Belum absen · Shift 08:00–16:00 · Kedamaian"), so the order list
 * stays near the top. Tapping opens the full attendance and schedule cards.
 */

import { useState, type FC } from 'react'
import { ChevronDown, Clock } from 'lucide-react'
import { useHrStore, todayIsoDate } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'
import { getMyDayStatus } from '../../domain/homeWorkDomain'
import { toJakarta } from '../../domain/orderTimingDomain'
import { SelfieAttendanceCard } from '../hr/SelfieAttendanceCard'
import { MySchedulePanel } from '../hr/MySchedulePanel'
import { surfaceCardClass } from '../ui/card'

const clock = (iso?: string): string => {
  if (!iso) return ''
  const date = toJakarta(new Date(iso))
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export const MyDayStrip: FC = () => {
  const employeeId = useUserStore((state) => state.employeeId)
  const attendance = useHrStore((state) => state.attendance)
  const overrides = useHrStore((state) => state.scheduleOverrides)
  const status = getMyDayStatus({ employeeId, today: todayIsoDate(), attendance, overrides })
  const needsCheckIn = status.attendance === 'not_checked_in' && Boolean(status.shift)
  const [open, setOpen] = useState(false)

  const attendanceLabel = status.attendance === 'off'
    ? 'Day off today'
    : status.attendance === 'done'
      ? 'Attendance complete'
      : status.attendance === 'checked_in'
        ? `Checked in ${clock(status.checkInTime)}`
        : status.shift
          ? 'Not checked in'
          // No shift and no check-in: nothing is missing, so don't warn.
          : 'No shift today'
  const shiftLabel = status.shift ? `Shift ${status.shift.startTime}–${status.shift.endTime} · ${status.shift.branchId}` : ''

  return (
    <section aria-label="My day" className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`${surfaceCardClass('standard')} flex w-full items-center gap-3 px-4 py-3 text-left`}
      >
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${needsCheckIn ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
          <Clock className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{attendanceLabel}</span>
          {shiftLabel && <span className="block truncate text-xs text-muted-foreground">{shiftLabel}</span>}
        </span>
        {needsCheckIn && !open && (
          <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Check in</span>
        )}
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4">
          <SelfieAttendanceCard />
          <MySchedulePanel />
        </div>
      )}
    </section>
  )
}
