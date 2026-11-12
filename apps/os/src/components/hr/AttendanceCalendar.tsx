/**
 * @file AttendanceCalendar.tsx
 * @description HR attendance as one table: employees down the side, dates
 * across the top. Each cell shows what happened that day; a ring marks what
 * still needs review. Tapping a cell opens that day: schedule vs actual,
 * photos, the review actions, and the manual record/correction.
 */

import { useMemo, useState, type FC } from 'react'
import { getEmployeeRoleLabel, useHrStore, todayIsoDate } from '../../store/hrStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useUserStore } from '../../store/userStore'
import type { Employee } from '../../store/hrStoreTypes'
import { isHrManagedEmployee } from '../../domain/hrManagedEmployeeDomain'
import { getEffectiveScheduleForDate, getMondayForDate, getWeekDates, toIsoDate } from '../../domain/hrSchedulingDomain'
import {
  buildAttendanceCalendar,
  getMonthDates,
  shiftMonth,
  type AttendanceCalendarCell,
  type AttendanceCellState,
} from '../../domain/attendanceCalendarDomain'
import { openAttendanceEvidence } from '../../data/attendanceEvidenceSupabase'
import { getDateLocale } from '../../i18n/uiLanguage'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { AppDialog } from '../ui/app-dialog'
import { PeoplePeriodNavigation } from './PeoplePeriodControls'
import { AttendanceReviewQueue } from './AttendanceReviewQueue'

type CalendarMode = 'week' | 'month'

const STATE_STYLE: Record<AttendanceCellState, { dot: string; cell: string }> = {
  present: { dot: 'bg-success', cell: 'bg-success/[0.07]' },
  late: { dot: 'bg-warning', cell: 'bg-warning/10' },
  absent: { dot: 'bg-destructive', cell: 'bg-destructive/[0.07]' },
  missing: { dot: 'bg-destructive', cell: 'bg-destructive/[0.07]' },
  leave: { dot: 'bg-info', cell: 'bg-info/[0.07]' },
  not_yet: { dot: 'bg-muted-foreground/40', cell: '' },
  planned: { dot: 'bg-transparent ring-1 ring-muted-foreground/40', cell: '' },
  off: { dot: 'bg-transparent', cell: 'bg-muted/40' },
}

/** "+1j30" — fits inside a calendar cell. */
const shortDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}j${rest ? String(rest).padStart(2, '0') : ''}` : `${rest}m`
}

const clock = (iso?: string) => iso
  ? new Date(iso).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
  : ''

const dayHeader = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00+07:00`).toLocaleDateString(getDateLocale(), { ...options, timeZone: 'Asia/Jakarta' })

export interface AttendanceCalendarProps {
  /** Active employees HR may see, already filtered by branch and search. */
  employees: Employee[]
  canEdit: boolean
  onOpenRecord: (employee: Employee, date: string) => void
  onOpenOrder?: (orderNumber: string) => void
  onCorrectAttendance?: (caseId: string, employeeId: string, date: string) => void
}

export const AttendanceCalendar: FC<AttendanceCalendarProps> = ({ employees, canEdit, onOpenRecord, onOpenOrder, onCorrectAttendance }) => {
  const tr = useBilingualCopy()
  const role = useUserStore((state) => state.role)
  const attendance = useHrStore((state) => state.attendance)
  const allCases = useHrStore((state) => state.attendanceReviewCases)
  const allEmployees = useHrStore((state) => state.employees)
  const defaults = useHrStore((state) => state.employeeDefaultSchedules)
  const overrides = useHrStore((state) => state.scheduleOverrides)
  const branches = useSettingsStore((state) => state.branches)
  const hrManagedRoles = useSettingsStore((state) => state.staffRoles.hrManagedRoles)
  const getSchedulingSettingsForDate = useSettingsStore((state) => state.getSchedulingSettingsForDate)
  const today = todayIsoDate()

  const [mode, setMode] = useState<CalendarMode>('week')
  const [anchor, setAnchor] = useState(today)
  const [onlyReview, setOnlyReview] = useState(false)
  const [openCell, setOpenCell] = useState<{ employee: Employee; cell: AttendanceCalendarCell } | null>(null)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  const dates = useMemo(
    () => mode === 'week' ? getWeekDates(toIsoDate(getMondayForDate(anchor))) : getMonthDates(anchor),
    [mode, anchor],
  )

  // Same visibility rule as the review list: Owner sees all staff, HR only the roles it manages.
  const reviewCases = useMemo(() => allCases.filter((item) => {
    const employee = allEmployees.find((entry) => entry.id === item.employeeId)
    return Boolean(employee && (role === 'owner' ? employee.systemRole !== 'owner' : isHrManagedEmployee(employee, 'attendance', hrManagedRoles)))
  }), [allCases, allEmployees, role, hrManagedRoles])

  const calendar = useMemo(() => buildAttendanceCalendar({
    employees,
    dates,
    today,
    attendance,
    reviewCases,
    getShift: (employee, date) => {
      const { shift } = getEffectiveScheduleForDate({
        employee,
        date,
        defaults,
        overrides,
        settings: { scheduling: getSchedulingSettingsForDate(date), branches },
      })
      return shift.isWorking ? { branchId: shift.branchId, startTime: shift.startTime, endTime: shift.endTime } : null
    },
  }), [employees, dates, today, attendance, reviewCases, defaults, overrides, getSchedulingSettingsForDate, branches])

  // Open items outside the visible dates must stay findable.
  const visibleIds = new Set(employees.map((employee) => employee.id))
  const pendingEverywhere = reviewCases
    .filter((item) => (item.status === 'pending' || item.status === 'problem') && visibleIds.has(item.employeeId))
    .sort((a, b) => a.date.localeCompare(b.date))
  const pendingOutside = pendingEverywhere.filter((item) => !dates.includes(item.date))
  const oldestOutside = pendingOutside[0]

  const rows = onlyReview ? calendar.rows.filter((row) => row.totals.pending > 0) : calendar.rows
  const branchName = (id: string) => branches.find((branch) => branch.id === id)?.name ?? id
  const move = (step: number) => setAnchor((current) => {
    if (mode === 'month') return shiftMonth(current, step)
    const date = new Date(`${current}T12:00:00+07:00`)
    date.setDate(date.getDate() + step * 7)
    return toIsoDate(date)
  })

  const periodLabel = mode === 'week'
    ? `${dayHeader(dates[0], { day: 'numeric', month: 'short' })} – ${dayHeader(dates[dates.length - 1], { day: 'numeric', month: 'short' })}`
    : dayHeader(dates[0], { month: 'long', year: 'numeric' })

  const stateLabel = (cell: AttendanceCalendarCell): string => {
    switch (cell.state) {
      case 'present': return clock(cell.record?.checkInAt) || tr('Present', 'Hadir')
      case 'late': return clock(cell.record?.checkInAt) || tr('Late', 'Telat')
      case 'absent': return tr('Absent', 'Absen')
      case 'missing': return tr('No record', 'Tidak absen')
      case 'leave': return tr('Leave', 'Cuti')
      case 'not_yet': return tr('Not yet', 'Belum')
      case 'planned': return cell.shift ? `${cell.shift.startTime}–${cell.shift.endTime}` : ''
      case 'off': return tr('Off', 'Libur')
    }
  }

  const cellAria = (employee: Employee, cell: AttendanceCalendarCell) =>
    `${employee.name} · ${dayHeader(cell.date, { day: 'numeric', month: 'short' })}${cell.pendingCases.length ? ` · ${tr('needs review', 'perlu dicek')}` : ''}`

  const isWeek = mode === 'week'
  const open = openCell
  const openRecord = open?.cell.record

  return <section aria-label={tr('Attendance calendar', 'Kalender absensi')} className="space-y-3">
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <PeoplePeriodNavigation
        onPrevious={() => move(-1)}
        onNext={() => move(1)}
        previousLabel={isWeek ? tr('Previous week', 'Minggu sebelumnya') : tr('Previous month', 'Bulan sebelumnya')}
        nextLabel={isWeek ? tr('Next week', 'Minggu berikutnya') : tr('Next month', 'Bulan berikutnya')}
      >
        <button type="button" onClick={() => setAnchor(today)} className="flex h-11 min-w-0 items-center justify-center rounded-full border border-border/90 bg-muted/60 px-3 text-sm font-semibold shadow-sm hover:bg-accent">
          <span className="truncate">{periodLabel}</span>
        </button>
      </PeoplePeriodNavigation>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={tr('Calendar range', 'Rentang kalender')} className="inline-flex h-11 rounded-full bg-muted/60 p-1 ring-1 ring-border/70">
          {(['week', 'month'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`rounded-full px-4 text-sm font-medium ${mode === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              {value === 'week' ? tr('Week', 'Minggu') : tr('Month', 'Bulan')}
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={onlyReview} onClick={() => setOnlyReview((value) => !value)} disabled={calendar.pendingTotal === 0 && !onlyReview}
          className={`inline-flex h-11 items-center rounded-full px-4 text-sm font-medium ring-1 disabled:opacity-50 ${onlyReview ? 'bg-warning/15 text-warning ring-warning/40' : 'ring-border/70 hover:bg-accent'}`}>
          {tr('Needs review', 'Perlu dicek')} · {calendar.pendingTotal}
        </button>
      </div>
    </div>

    {oldestOutside && (
      <button type="button" onClick={() => { setMode('week'); setAnchor(oldestOutside.date) }} className="w-full rounded-xl bg-warning/10 px-3 py-2 text-left text-sm text-warning">
        {tr(`${pendingOutside.length} more to review outside this period · oldest`, `${pendingOutside.length} lagi perlu dicek di luar periode ini · terlama`)} {dayHeader(oldestOutside.date, { day: 'numeric', month: 'short' })} →
      </button>
    )}
    {evidenceError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{evidenceError}</p>}

    {rows.length === 0
      ? <p className="rounded-xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">{onlyReview ? tr('Nothing to review in this period.', 'Tidak ada yang perlu dicek di periode ini.') : tr('No active employees.', 'Belum ada karyawan aktif.')}</p>
      : <div className="overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
        <div className="no-scrollbar overflow-x-auto overscroll-x-contain">
          <table className={`table-fixed border-separate border-spacing-0 text-xs ${isWeek ? 'w-full min-w-[860px]' : 'min-w-max'}`}>
            <colgroup>
              <col className="w-[132px]" />
              {dates.map((date) => <col key={date} className={isWeek ? 'w-[96px]' : 'w-[34px]'} />)}
              <col className="w-[112px]" />
            </colgroup>
            <thead>
              <tr className="h-11 bg-surface-panel text-muted-foreground">
                <th className="sticky left-0 z-20 bg-surface-panel px-3 text-left font-semibold text-foreground shadow-[1px_0_0_hsl(var(--border))]">{tr('Staff', 'Staf')}</th>
                {dates.map((date) => (
                  <th key={date} className={`px-1 text-center font-medium ${date === today ? 'text-primary' : ''}`}>
                    {isWeek
                      ? <><span className="block">{dayHeader(date, { weekday: 'short' })}</span><span className="block font-semibold text-foreground">{dayHeader(date, { day: 'numeric' })}</span></>
                      : dayHeader(date, { day: 'numeric' })}
                  </th>
                ))}
                <th className="px-2 text-left font-semibold text-foreground">{tr('Total', 'Total')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employee.id}>
                  <th scope="row" className="sticky left-0 z-10 border-t border-border/60 bg-card px-3 py-2 text-left font-normal shadow-[1px_0_0_hsl(var(--border))]">
                    <span className="block truncate text-sm font-semibold text-foreground">{row.employee.name}</span>
                    <span className="block truncate text-2xs text-muted-foreground">{getEmployeeRoleLabel(row.employee.systemRole)}</span>
                  </th>
                  {row.cells.map((cell) => {
                    const style = STATE_STYLE[cell.state]
                    const needsReview = cell.pendingCases.length > 0
                    return <td key={cell.date} className="border-t border-l border-border/40 p-0.5">
                      <button
                        type="button"
                        aria-label={cellAria(row.employee, cell)}
                        data-attendance-cell={`${row.employee.id}|${cell.date}`}
                        onClick={() => setOpenCell({ employee: row.employee, cell })}
                        className={`relative flex w-full flex-col items-center justify-center rounded-md text-center transition hover:bg-accent ${isWeek ? 'h-12 gap-0.5 px-1' : 'h-9'} ${style.cell} ${needsReview ? 'ring-2 ring-inset ring-warning' : ''} ${cell.date === today ? 'outline outline-1 outline-primary/30' : ''}`}
                      >
                        <span className={`size-2 rounded-full ${style.dot}`} aria-hidden="true" />
                        {isWeek && <span className={`max-w-full truncate text-2xs ${cell.state === 'off' || cell.state === 'planned' ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>{stateLabel(cell)}</span>}
                        {isWeek && cell.approvedOvertimeMinutes > 0 && <span className="absolute right-1 top-0.5 rounded bg-card/80 px-0.5 text-[9px] font-semibold text-success">+{shortDuration(cell.approvedOvertimeMinutes)}</span>}
                      </button>
                    </td>
                  })}
                  <td className="border-t border-l border-border/40 px-2 py-1.5 text-2xs leading-4 text-muted-foreground">
                    {row.totals.late > 0 && <span className="block text-warning">{tr('Late', 'Telat')} {row.totals.late}</span>}
                    {row.totals.absent > 0 && <span className="block text-destructive">{tr('Absent', 'Absen')} {row.totals.absent}</span>}
                    {row.totals.overtimeMinutes > 0 && <span className="block text-success">{tr('OT', 'Lembur')} {shortDuration(row.totals.overtimeMinutes)}</span>}
                    {row.totals.late + row.totals.absent + row.totals.overtimeMinutes === 0 && <span>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            {isWeek && <tfoot>
              <tr className="bg-surface-panel text-2xs text-muted-foreground">
                <th className="sticky left-0 z-10 bg-surface-panel px-3 py-2 text-left font-semibold text-foreground shadow-[1px_0_0_hsl(var(--border))]">{tr('Per day', 'Per hari')}</th>
                {calendar.columns.map((column) => (
                  <td key={column.date} className="border-l border-border/40 px-1 py-2 text-center leading-4">
                    {column.date <= today && <span className="block">{tr('Present', 'Hadir')} {column.present}</span>}
                    {column.late > 0 && <span className="block text-warning">{tr('Late', 'Telat')} {column.late}</span>}
                    {column.absent > 0 && <span className="block text-destructive">{tr('Absent', 'Absen')} {column.absent}</span>}
                  </td>
                ))}
                <td className="border-l border-border/40" />
              </tr>
            </tfoot>}
          </table>
        </div>
      </div>}

    <ul aria-label={tr('Legend', 'Keterangan')} className="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
      {([['bg-success', tr('On time', 'Tepat waktu')], ['bg-warning', tr('Late', 'Telat')], ['bg-destructive', tr('Absent / no record', 'Absen / tidak absen')], ['bg-info', tr('Leave', 'Cuti')]] as const).map(([dot, label]) => (
        <li key={label} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${dot}`} />{label}</li>
      ))}
      <li className="flex items-center gap-1.5"><span className="size-3 rounded-sm ring-2 ring-inset ring-warning" />{tr('Needs review', 'Perlu dicek')}</li>
    </ul>

    <AppDialog
      open={Boolean(open)}
      onOpenChange={(value) => { if (!value) setOpenCell(null) }}
      size="compact"
      title={open ? `${open.employee.name} · ${dayHeader(open.cell.date, { weekday: 'long', day: 'numeric', month: 'short' })}` : ''}
    >
      {open && <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-4">
          <div><dt className="text-2xs text-muted-foreground">{tr('Shift', 'Jadwal')}</dt><dd className="font-medium">{open.cell.shift ? `${open.cell.shift.startTime}–${open.cell.shift.endTime}` : tr('Off', 'Libur')}</dd>{open.cell.shift?.branchId && <dd className="text-2xs text-muted-foreground">{branchName(open.cell.shift.branchId)}</dd>}</div>
          <div><dt className="text-2xs text-muted-foreground">{tr('In', 'Masuk')}</dt><dd className="font-medium">{clock(openRecord?.checkInAt) || '—'}</dd>{openRecord?.checkInLocation?.detectedBranchName && <dd className="text-2xs text-muted-foreground">{openRecord.checkInLocation.detectedBranchName}</dd>}</div>
          <div><dt className="text-2xs text-muted-foreground">{tr('Out', 'Pulang')}</dt><dd className="font-medium">{clock(openRecord?.checkOutAt) || '—'}</dd></div>
          <div><dt className="text-2xs text-muted-foreground">{tr('Status', 'Status')}</dt><dd className="font-medium">{stateLabelFor(open.cell.state, tr)}</dd></div>
        </dl>
        {(openRecord?.selfieDataUrl || openRecord?.checkOutSelfieDataUrl) && <div className="flex flex-wrap gap-2">
          {openRecord?.selfieDataUrl && <button type="button" onClick={() => void openAttendanceEvidence(openRecord.selfieDataUrl).catch((cause) => setEvidenceError(cause instanceof Error ? cause.message : 'Unable to open attendance evidence.'))} className="h-10 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent">{tr('Check-in photo', 'Foto masuk')}</button>}
          {openRecord?.checkOutSelfieDataUrl && <button type="button" onClick={() => void openAttendanceEvidence(openRecord.checkOutSelfieDataUrl).catch((cause) => setEvidenceError(cause instanceof Error ? cause.message : 'Unable to open attendance evidence.'))} className="h-10 rounded-full border border-border px-4 text-sm font-medium hover:bg-accent">{tr('Check-out photo', 'Foto pulang')}</button>}
        </div>}
        {openRecord?.note && <p className="text-sm text-muted-foreground">{tr('Note', 'Catatan')}: {openRecord.note}</p>}
        {openRecord?.corrections?.map((item, index) => <p key={index} className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{tr('Corrected', 'Dikoreksi')}: {item.reason}</p>)}

        {(open.cell.pendingCases.length + open.cell.resolvedCases.length) > 0 && (
          <AttendanceReviewQueue
            scope={{ employeeId: open.employee.id, date: open.cell.date }}
            onOpenOrder={(orderNumber) => { setOpenCell(null); onOpenOrder?.(orderNumber) }}
            onCorrectAttendance={(caseId, employeeId, date) => { setOpenCell(null); onCorrectAttendance?.(caseId, employeeId, date) }}
          />
        )}

        {canEdit && open.cell.date <= today && (
          <div className="flex justify-end border-t border-border pt-3">
            <button type="button" onClick={() => { const { employee, cell } = open; setOpenCell(null); onOpenRecord(employee, cell.date) }} className="h-11 rounded-full bg-foreground px-[18px] text-sm font-medium text-background">
              {openRecord ? tr('Correct record', 'Koreksi absensi') : tr('Add record', 'Tambah absensi')}
            </button>
          </div>
        )}
      </div>}
    </AppDialog>
  </section>
}

const stateLabelFor = (state: AttendanceCellState, tr: (en: string, id: string) => string): string => ({
  present: tr('On time', 'Tepat waktu'),
  late: tr('Late', 'Telat'),
  absent: tr('Absent', 'Absen'),
  missing: tr('No record', 'Tidak absen'),
  leave: tr('Leave', 'Cuti'),
  not_yet: tr('Not checked in', 'Belum absen'),
  planned: tr('Scheduled', 'Terjadwal'),
  off: tr('Off', 'Libur'),
})[state]
