/**
 * @file MyDayStrip.tsx
 * @description Staff attendance as a small chip in the top bar, on every
 * screen: "Check in" while a shift is waiting, a clock afterwards. Tapping
 * opens the attendance and schedule cards. Replaces the full-width card that
 * used to sit at the top of each Home screen.
 */

import { useEffect, useState, type FC } from 'react'
import { Clock } from 'lucide-react'
import { useHrStore, todayIsoDate } from '../../store/hrStore'
import { useUserStore } from '../../store/userStore'
import { getMyDayStatus } from '../../domain/homeWorkDomain'
import { toJakarta } from '../../domain/orderTimingDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { SelfieAttendanceCard } from '../hr/SelfieAttendanceCard'
import { MySchedulePanel } from '../hr/MySchedulePanel'
import { AppDialog } from '../ui/app-dialog'

/** Dispatch to open the attendance sheet from anywhere (e.g. a notification). */
export const OPEN_MY_DAY_EVENT = 'open-my-day'

const clock = (iso?: string): string => {
  if (!iso) return ''
  const date = toJakarta(new Date(iso))
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export const MyDayChip: FC = () => {
  const tr = useBilingualCopy()
  const role = useUserStore((state) => state.role)
  const employeeId = useUserStore((state) => state.employeeId)
  const attendance = useHrStore((state) => state.attendance)
  const overrides = useHrStore((state) => state.scheduleOverrides)
  const status = getMyDayStatus({ employeeId, today: todayIsoDate(), attendance, overrides })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(OPEN_MY_DAY_EVENT, show)
    return () => window.removeEventListener(OPEN_MY_DAY_EVENT, show)
  }, [])

  // Owner does not take attendance.
  if (role === 'owner' || !employeeId) return null

  const needsCheckIn = status.attendance === 'not_checked_in' && Boolean(status.shift)
  const label = status.attendance === 'off'
    ? tr('Day off today', 'Libur hari ini')
    : status.attendance === 'done'
      ? tr('Attendance complete', 'Absensi lengkap')
      : status.attendance === 'checked_in'
        ? tr(`Checked in ${clock(status.checkInTime)}`, `Masuk ${clock(status.checkInTime)}`)
        : status.shift
          ? tr('Not checked in', 'Belum absen')
          : tr('No shift today', 'Tidak ada shift hari ini')
  const shiftLabel = status.shift ? `${status.shift.startTime}–${status.shift.endTime} · ${status.shift.branchId}` : ''

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}${shiftLabel ? ` · ${shiftLabel}` : ''}`}
        className={needsCheckIn
          ? 'inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm'
          : 'relative flex size-11 items-center justify-center rounded-full text-foreground transition hover:bg-muted/70'}
      >
        <Clock className={needsCheckIn ? 'size-3.5' : 'size-[18px]'} strokeWidth={2.15} />
        {needsCheckIn
          ? tr('Check in', 'Absen')
          : status.attendance === 'checked_in' && <span className="absolute right-2 top-2 size-2 rounded-full bg-success ring-2 ring-background" aria-hidden="true" />}
      </button>
      <AppDialog open={open} onOpenChange={setOpen} size="compact" title={label} description={shiftLabel || undefined}>
        <div className="space-y-4">
          <SelfieAttendanceCard />
          <MySchedulePanel />
        </div>
      </AppDialog>
    </>
  )
}
