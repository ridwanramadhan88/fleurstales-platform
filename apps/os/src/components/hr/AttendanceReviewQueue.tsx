import { useEffect, useMemo, useState } from 'react'
import { useHrStore } from '../../store/hrStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import type { AttendanceReviewCase } from '../../store/hrStoreTypes'
import { isHrManagedEmployee } from '../../domain/hrManagedEmployeeDomain'
import { useSettingsStore } from '../../store/settingsStore'
import { AppDialog } from '../ui/app-dialog'
import { openAttendanceEvidence } from '../../data/attendanceEvidenceSupabase'
import { getDateLocale } from '../../i18n/uiLanguage'
import { usePayrollStore } from '../../store/payrollStore'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { formatOvertimeDuration } from '../../domain/payrollAdditionsDomain'

const formatIdr = (value: number): string => `Rp ${Math.round(value).toLocaleString('id-ID')}`

const LABELS: Record<AttendanceReviewCase['warningType'], string> = {
  late_check_in: 'Late check-in',
  missing_check_in: 'Missing check-in',
  missing_check_out: 'Missing checkout',
  early_check_out: 'Early checkout',
  overtime: 'Overtime',
  wrong_branch: 'Wrong branch',
  scheduled_day_off: 'Unscheduled attendance',
  outside_shift_time: 'Outside shift time',
  delivery_late: 'Delivery late',
}

type WarningView = 'pending' | 'resolved'

export interface AttendanceReviewQueueProps {
  onOpenOrder?: (orderNumber: string) => void
  onCorrectAttendance?: (caseId: string, employeeId: string, date: string) => void
  searchQuery?: string
  /** One employee on one day: used by the attendance calendar's day sheet. */
  scope?: { employeeId: string; date: string }
}

export const AttendanceReviewQueue = ({ onOpenOrder, onCorrectAttendance, searchQuery = '', scope }: AttendanceReviewQueueProps) => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const hrManagedRoles = useSettingsStore((state) => state.staffRoles.hrManagedRoles)
  const cases = useHrStore((state) => state.attendanceReviewCases)
  const employees = useHrStore((state) => state.employees)
  const attendance = useHrStore((state) => state.attendance)
  const generateAttendance = useHrStore((state) => state.generateAttendanceWarnings)
  const generateOrderWarnings = useHrStore((state) => state.generateOrderWarnings)
  const review = useHrStore((state) => state.reviewAttendanceCase)
  const approveOvertime = useHrStore((state) => state.approveOvertimeCase)
  const revokeOvertime = useHrStore((state) => state.revokeOvertimeApproval)
  const syncOvertime = usePayrollStore((state) => state.syncOvertimeAdditionsForEmployee)
  const payrollPeriods = usePayrollStore((state) => state.periods)
  const employeePayrolls = usePayrollStore((state) => state.employeePayrolls)
  const tr = useBilingualCopy()
  const [overtimeMinutes, setOvertimeMinutes] = useState('')
  const [overtimeAmount, setOvertimeAmount] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const orders = useOrdersStore((state) => state.orders)

  const [view, setView] = useState<WarningView>('pending')
  const [selected, setSelected] = useState<AttendanceReviewCase | null>(null)
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  // Re-run when attendance arrives or changes too: HR data can load after the
  // orders, and a check-out recorded later must still become a review case.
  // Both generators skip cases that already exist.
  useEffect(() => {
    generateAttendance()
    generateOrderWarnings(orders)
  }, [generateAttendance, generateOrderWarnings, orders, attendance])

  const managedCases = useMemo(
    () => cases.filter((item) => {
      if (scope && (item.employeeId !== scope.employeeId || item.date !== scope.date)) return false
      const employee = employees.find((entry) => entry.id === item.employeeId)
      return Boolean(employee && (role === 'owner' ? employee.systemRole !== 'owner' : isHrManagedEmployee(employee, 'attendance', hrManagedRoles)))
    }),
    [cases, employees, role, hrManagedRoles, scope?.employeeId, scope?.date],
  )

  const filteredManagedCases = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return managedCases
    return managedCases.filter((item) => {
      const employee = employees.find((entry) => entry.id === item.employeeId)
      return [employee?.name, item.reason, item.orderNumber, item.date, LABELS[item.warningType]]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [managedCases, employees, searchQuery])

  const pendingCases = useMemo(
    () => filteredManagedCases.filter((item) => item.status === 'pending' || item.status === 'problem').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [filteredManagedCases],
  )
  const resolvedCases = useMemo(
    () => filteredManagedCases.filter((item) => item.status !== 'pending' && item.status !== 'problem').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filteredManagedCases],
  )

  // The day sheet shows everything for that day: open items first.
  const visible = scope ? [...pendingCases, ...resolvedCases] : view === 'pending' ? pendingCases : resolvedCases

  const openReview = (item: AttendanceReviewCase) => {
    setSelected(item)
    setNote('')
    setError(null)
    setOvertimeMinutes(item.warningType === 'overtime' ? String(item.minutesDifference ?? '') : '')
    setOvertimeAmount('')
  }

  /** Payroll row of the employee for that date, if HR can still change it. */
  const payrollLock = (employeeId: string, date: string): 'editable' | 'none' | 'locked' => {
    const period = payrollPeriods.find((item) => item.periodStart <= date && date <= item.periodEnd)
    const draft = period ? employeePayrolls.find((item) => item.payrollPeriodId === period.id && item.employeeId === employeeId && item.entryMode !== 'manual' && item.status !== 'resolved') : undefined
    if (!draft) return 'none'
    return ['draft', 'finance_rejected'].includes(draft.status) ? 'editable' : 'locked'
  }

  const approveSelectedOvertime = () => {
    if (!selected) return
    const minutes = Number(overtimeMinutes.replace(/\D/g, ''))
    const amountIdr = Number(overtimeAmount.replace(/\D/g, ''))
    const actor = { name: actorName, role }
    const result = approveOvertime({ caseId: selected.id, minutes, amountIdr, note, actor })
    if (!result.ok) {
      setError(result.reason)
      return
    }
    const lock = payrollLock(result.employeeId, result.date)
    if (lock === 'editable') {
      const synced = syncOvertime({ employeeId: result.employeeId, date: result.date, actor })
      setNotice(synced.ok
        ? tr('Overtime confirmed and added to this period\'s payroll additions.', 'Lembur disetujui dan langsung masuk tambahan gaji periode ini.')
        : synced.reason)
    } else {
      setNotice(lock === 'locked'
        ? tr('Overtime confirmed. This period\'s payroll is already with Finance, so it is added if Finance returns the payroll.', 'Lembur disetujui. Gaji periode ini sudah di Keuangan, jadi lembur masuk bila Keuangan mengembalikan penggajian.')
        : tr('Overtime confirmed. It is added automatically when payroll for this period is generated.', 'Lembur disetujui. Lembur otomatis masuk saat penggajian periode ini dibuat.'))
    }
    setSelected(null)
    setNote('')
    setError(null)
  }

  const revokeCaseOvertime = (item: AttendanceReviewCase) => {
    if (payrollLock(item.employeeId, item.date) === 'locked') {
      setNotice(tr('This overtime is already in payroll sent to Finance and cannot be changed.', 'Lembur ini sudah masuk penggajian yang dikirim ke Keuangan dan tidak bisa diubah.'))
      return
    }
    const actor = { name: actorName, role }
    const result = revokeOvertime({ caseId: item.id, actor })
    if (!result.ok) {
      setNotice(result.reason)
      return
    }
    syncOvertime({ employeeId: result.employeeId, date: result.date, actor })
    setNotice(tr('Overtime reopened and removed from payroll additions.', 'Persetujuan lembur dibatalkan dan dihapus dari tambahan gaji.'))
  }

  const confirmSelected = () => {
    if (!selected) return
    const result = review({ caseId: selected.id, decision: 'resolved', note, actor: { name: actorName, role } })
    if (!result.ok) {
      setError(result.reason)
      return
    }
    setSelected(null)
    setNote('')
    setError(null)
  }

  const correctSelected = () => {
    if (!selected || selected.sourceType === 'order') return
    onCorrectAttendance?.(selected.id, selected.employeeId, selected.date)
    setSelected(null)
    setNote('')
    setError(null)
  }

  const emptyCopy: Record<WarningView, string> = {
    pending: 'No attendance items need review.',
    resolved: 'No resolved attendance items yet.',
  }

  return <section aria-label="Attendance review" className="space-y-3">
    {!scope && <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <h3 className="text-sm font-semibold leading-5">Attendance review</h3>
      </div>
      {pendingCases.length > 0 && (
        <span className="shrink-0 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
          {`${pendingCases.length} to review`}
        </span>
      )}
    </div>}

    {evidenceError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{evidenceError}</p>}

    {!scope && <nav className="flex gap-6 border-b border-border/60" aria-label="Attendance review status">
      <button type="button" onClick={() => setView('pending')} aria-current={view === 'pending' ? 'page' : undefined} className={`relative h-9 whitespace-nowrap px-1 text-sm font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-current ${view === 'pending' ? 'text-foreground after:scale-x-100' : 'text-muted-foreground after:scale-x-0'}`}>Needs review{pendingCases.length > 0 ? ` · ${pendingCases.length}` : ''}</button>
      <button type="button" onClick={() => setView('resolved')} aria-current={view === 'resolved' ? 'page' : undefined} className={`relative h-9 whitespace-nowrap px-1 text-sm font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-current ${view === 'resolved' ? 'text-foreground after:scale-x-100' : 'text-muted-foreground after:scale-x-0'}`}>Resolved</button>
    </nav>}

    {notice && <p role="status" className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}
    <div className="space-y-3">
      {visible.length === 0
        ? (scope ? null : <div className="py-5"><p className="text-sm text-muted-foreground">{emptyCopy[view]}</p></div>)
        : visible.map((item) => {
          const employee = employees.find((entry) => entry.id === item.employeeId)
          const record = attendance.find((entry) => entry.id === item.attendanceId)
          const expanded = expandedCaseId === item.id
          const needsReview = item.status === 'pending' || item.status === 'problem'
          return <article key={item.id} className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 shadow-sm">
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${needsReview ? 'bg-warning/10 text-warning' : 'bg-surface-neutral text-muted-foreground ring-1 ring-border/70'}`}>{LABELS[item.warningType]}</span>
                  {!needsReview
                    ? item.warningType === 'overtime' && item.status === 'accepted'
                      ? <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">{tr(`Overtime approved · ${formatOvertimeDuration(item.approvedOvertimeMinutes ?? 0)} · ${formatIdr(item.approvedOvertimeAmountIdr ?? 0)}`, `Lembur disetujui · ${formatOvertimeDuration(item.approvedOvertimeMinutes ?? 0)} · ${formatIdr(item.approvedOvertimeAmountIdr ?? 0)}`)}</span>
                      : <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">Resolved</span>
                    : null}
                </div>
                <div className={scope && !item.orderNumber ? 'hidden' : undefined}>
                  <p className={scope ? 'hidden' : 'text-base font-semibold leading-6'}>{employee?.name ?? 'Unknown employee'}</p>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                    {new Date(`${item.date}T12:00:00+07:00`).toLocaleDateString(getDateLocale(),{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'})}
                    {item.orderNumber ? <> · Order <button type="button" onClick={() => onOpenOrder?.(item.orderNumber!)} className="font-semibold text-primary hover:underline">{item.orderNumber}</button></> : ''}
                  </p>
                </div>
                <p className="max-w-3xl text-sm leading-5 text-muted-foreground">{item.warningType === 'overtime' && item.minutesDifference !== undefined
                  ? item.reason.startsWith('Employee claimed overtime')
                    ? tr(`Employee claimed overtime: checked out ${item.minutesDifference} minutes after the shift end.`, `Karyawan mengajukan lembur: absen pulang ${formatOvertimeDuration(item.minutesDifference)} setelah jam sif selesai.`)
                    : tr(`Checked out ${item.minutesDifference} minutes after the shift end.`, `Absen pulang ${formatOvertimeDuration(item.minutesDifference)} setelah jam sif selesai.`)
                  : item.reason}</p>
                {item.employeeNote && <p className="max-w-3xl text-sm leading-5">{tr('Employee note', 'Catatan karyawan')}: {item.employeeNote}</p>}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-3 py-2 sm:px-4">
              <button type="button" onClick={() => setExpandedCaseId(expanded ? null : item.id)} className="inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-primary hover:bg-accent">{expanded ? 'Hide details' : 'View details'}</button>
              {needsReview && <button type="button" onClick={() => openReview(item)} className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90">Review</button>}
              {item.warningType === 'overtime' && item.status === 'accepted' && <button type="button" onClick={() => revokeCaseOvertime(item)} className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium hover:bg-accent">{tr('Cancel overtime approval', 'Batalkan persetujuan lembur')}</button>}
            </div>

            {expanded && <div className="space-y-2 border-t border-border/70 px-4 py-3 sm:px-5">
              {item.sourceType === 'order'
                ? <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>Source: Delivery Order</span>
                    <span>Branch: {item.scheduledBranchName ?? 'Not recorded'}</span>
                  </div>
                : <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>Schedule: {item.scheduledStartTime && item.scheduledEndTime ? `${item.scheduledStartTime}–${item.scheduledEndTime}` : 'Off'}</span>
                    <span>Actual: {item.actualTime ?? 'No checkout'}</span>
                    <span>Branch: {item.detectedBranchName ?? 'Not recorded'}</span>
                  </div>}
              {record?.selfieDataUrl && <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => void openAttendanceEvidence(record.selfieDataUrl).catch((cause) => setEvidenceError(cause instanceof Error ? cause.message : 'Unable to open attendance evidence.'))} className="text-xs text-primary underline">Check-in selfie</button>
                {record.checkOutSelfieDataUrl && <button type="button" onClick={() => void openAttendanceEvidence(record.checkOutSelfieDataUrl).catch((cause) => setEvidenceError(cause instanceof Error ? cause.message : 'Unable to open attendance evidence.'))} className="text-xs text-primary underline">Checkout selfie</button>}
              </div>}
              {item.reviewNote && <p className="rounded-lg bg-muted/40 p-2 text-xs">{item.reviewedBy}: {item.reviewNote}</p>}
            </div>}
          </article>
        })}
    </div>

    <AppDialog
      open={Boolean(selected)}
      onOpenChange={(open) => { if (!open) setSelected(null) }}
      size="standard"
      title="Review attendance"
      description={selected ? (selected.warningType === 'overtime' ? tr(`Overtime · ${selected.minutesDifference ?? 0} minutes after the shift end`, `Lembur · ${formatOvertimeDuration(selected.minutesDifference ?? 0)} setelah jam sif`) : `${LABELS[selected.warningType]} · ${selected.reason}`) : undefined}
    >
      {selected && <div className="space-y-4">
        {selected.warningType === 'overtime' && (
          <div className="space-y-3 rounded-xl border border-border bg-surface-panel p-3" data-testid="overtime-approval">
            <p className="text-sm font-semibold">{tr('Confirm overtime', 'Konfirmasi lembur')}</p>
            {selected.employeeNote && <p className="text-xs text-muted-foreground">{tr('Employee note', 'Catatan karyawan')}: {selected.employeeNote}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium">{tr('Duration (minutes)', 'Durasi (menit)')}</span>
                <input aria-label={tr('Overtime duration in minutes', 'Durasi lembur (menit)')} inputMode="numeric" value={overtimeMinutes} onChange={(event) => setOvertimeMinutes(event.target.value.replace(/\D/g, ''))} className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium">{tr('Overtime pay (IDR)', 'Nominal lembur (Rp)')}</span>
                <input aria-label={tr('Overtime pay in rupiah', 'Nominal lembur (Rp)')} inputMode="numeric" value={overtimeAmount} onChange={(event) => setOvertimeAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm" />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">{tr('The amount goes straight into this period\'s payroll additions.', 'Nominal ini langsung masuk tambahan gaji periode tersebut.')}</p>
          </div>
        )}
        <label className="space-y-1">
          <span className="text-xs font-medium">Review note · Optional</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add optional context..." className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30" />
        </label>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-2 border-t border-border bg-surface-footer pt-4">
          <button type="button" onClick={() => setSelected(null)} className="h-11 rounded-full border border-border bg-card px-[18px] text-sm font-medium hover:bg-accent">Cancel</button>
          {selected.warningType === 'overtime'
            ? <>
                <button type="button" onClick={approveSelectedOvertime} className="h-11 rounded-full bg-success px-[18px] text-sm font-semibold text-success-foreground hover:bg-success/90">{tr('Approve overtime', 'Setujui lembur')}</button>
                <button type="button" onClick={confirmSelected} className="col-span-2 h-11 rounded-full border border-border bg-card px-[18px] text-sm font-semibold text-foreground hover:bg-accent">{tr('Not overtime', 'Bukan lembur')}</button>
              </>
            : <button type="button" onClick={confirmSelected} className="h-11 rounded-full bg-success px-[18px] text-sm font-semibold text-success-foreground hover:bg-success/90">Confirm record</button>}
          {selected.sourceType !== 'order' && <button type="button" onClick={correctSelected} className="col-span-2 h-11 rounded-full border border-border bg-card px-[18px] text-sm font-semibold text-foreground hover:bg-accent">Correct attendance</button>}
        </div>
      </div>}
    </AppDialog>
  </section>
}
