import { useEffect, useMemo, useState } from 'react'
import { useHrStore } from '../../store/hrStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useUserStore } from '../../store/userStore'
import type { AttendanceReviewCase, AttendanceReviewDecision } from '../../store/hrStoreTypes'
import { isHrManagedEmployee } from '../../domain/hrManagedEmployeeDomain'
import { useSettingsStore } from '../../store/settingsStore'
import { AppDialog } from '../ui/app-dialog'

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

export interface AttendanceReviewQueueProps { onOpenOrder?: (orderNumber: string) => void; searchQuery?: string }

export const AttendanceReviewQueue = ({ onOpenOrder, searchQuery = '' }: AttendanceReviewQueueProps) => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const hrManagedRoles = useSettingsStore((state) => state.staffRoles.hrManagedRoles)
  const cases = useHrStore((state) => state.attendanceReviewCases)
  const employees = useHrStore((state) => state.employees)
  const attendance = useHrStore((state) => state.attendance)
  const generateAttendance = useHrStore((state) => state.generateAttendanceWarnings)
  const generateOrderWarnings = useHrStore((state) => state.generateOrderWarnings)
  const review = useHrStore((state) => state.reviewAttendanceCase)
  const orders = useOrdersStore((state) => state.orders)

  const [view, setView] = useState<WarningView>('pending')
  const [selected, setSelected] = useState<AttendanceReviewCase | null>(null)
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    generateAttendance()
    generateOrderWarnings(orders)
  }, [generateAttendance, generateOrderWarnings, orders])

  const managedCases = useMemo(
    () => cases.filter((item) => {
      const employee = employees.find((entry) => entry.id === item.employeeId)
      return Boolean(employee && (role === 'owner' ? employee.systemRole !== 'owner' : isHrManagedEmployee(employee, 'attendance', hrManagedRoles)))
    }),
    [cases, employees, role, hrManagedRoles],
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
    () => filteredManagedCases.filter((item) => item.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [filteredManagedCases],
  )
  const resolvedCases = useMemo(
    () => filteredManagedCases.filter((item) => item.status !== 'pending' && item.status !== 'problem').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [filteredManagedCases],
  )

  const visible = view === 'pending' ? pendingCases : resolvedCases

  const openReview = (item: AttendanceReviewCase) => {
    setSelected(item)
    setNote('')
    setError(null)
  }

  const submit = (decision: AttendanceReviewDecision) => {
    if (!selected) return
    const result = review({ caseId: selected.id, decision, note, actor: { name: actorName, role } })
    if (!result.ok) {
      setError(result.reason)
      return
    }
    setSelected(null)
    setNote('')
    setError(null)
  }

  const emptyCopy: Record<WarningView, string> = {
    pending: 'No employee warnings need review.',
    resolved: 'No completed employee warnings yet.',
  }

  return <section aria-label="Employee warning review" className="space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-5">Employee warning review</h3>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Review attendance warnings and escalate unresolved cases to Reports → Problem List.</p>
      </div>
      <span className="shrink-0 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">{pendingCases.length} to review</span>
    </div>

    <nav className="flex gap-6 border-b border-border/60" aria-label="Warning review status">
      <button type="button" onClick={() => setView('pending')} aria-current={view === 'pending' ? 'page' : undefined} className={`relative h-9 whitespace-nowrap px-1 text-sm font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-current ${view === 'pending' ? 'text-foreground after:scale-x-100' : 'text-muted-foreground after:scale-x-0'}`}>Needs review · {pendingCases.length}</button>
      <button type="button" onClick={() => setView('resolved')} aria-current={view === 'resolved' ? 'page' : undefined} className={`relative h-9 whitespace-nowrap px-1 text-sm font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-current ${view === 'resolved' ? 'text-foreground after:scale-x-100' : 'text-muted-foreground after:scale-x-0'}`}>Solved</button>
    </nav>

    <div className="space-y-3">
      {visible.length === 0
        ? <div className="py-5"><p className="text-sm text-muted-foreground">{emptyCopy[view]}</p></div>
        : visible.map((item) => {
          const employee = employees.find((entry) => entry.id === item.employeeId)
          const record = attendance.find((entry) => entry.id === item.attendanceId)
          const expanded = expandedCaseId === item.id
          return <article key={item.id} className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 shadow-sm">
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">{LABELS[item.warningType]}</span>
                  {item.status !== 'pending' && item.status !== 'problem'
                    ? <span className="rounded-full bg-surface-neutral px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border/80">Solved</span>
                    : null}
                </div>
                <div>
                  <p className="text-base font-semibold leading-6">{employee?.name ?? 'Unknown employee'}</p>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                    {new Date(`${item.date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
                    {item.orderNumber ? <> · Order <button type="button" onClick={() => onOpenOrder?.(item.orderNumber!)} className="font-semibold text-primary hover:underline">{item.orderNumber}</button></> : ''}
                  </p>
                </div>
                <p className="max-w-3xl text-sm leading-5 text-muted-foreground">{item.reason}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-3 py-2 sm:px-4">
              <button type="button" onClick={() => setExpandedCaseId(expanded ? null : item.id)} className="inline-flex h-10 items-center rounded-full px-3 text-sm font-medium text-primary hover:bg-accent">{expanded ? 'Hide details' : 'View details'}</button>
              {item.status === 'pending' && <button type="button" onClick={() => openReview(item)} className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm font-semibold text-background hover:bg-foreground/90">Review</button>}
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
                <a href={record.selfieDataUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Check-in selfie</a>
                {record.checkOutSelfieDataUrl && <a href={record.checkOutSelfieDataUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Checkout selfie</a>}
              </div>}
              {item.reviewNote && <p className="rounded-lg bg-muted/40 p-2 text-xs">{item.reviewedBy}: {item.reviewNote}</p>}
            </div>}
          </article>
        })}
    </div>

    <AppDialog
      open={Boolean(selected)}
      onOpenChange={(open) => { if (!open) setSelected(null) }}
      title={selected?.status === 'problem' ? 'Solve employee Problem' : 'Review employee warning'}
      description={selected ? `${LABELS[selected.warningType]} · ${selected.reason}` : undefined}
      contentClassName="max-w-md"
    >
      {selected && <div className="space-y-4">
        <label className="space-y-1">
          <span className="text-xs font-medium">Review note · Optional</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add optional context..." className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/30" />
        </label>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="grid grid-cols-2 gap-2 border-t border-border bg-surface-footer pt-4">
          <button type="button" onClick={() => setSelected(null)} className="h-11 rounded-full border border-border bg-card px-[18px] text-sm font-medium hover:bg-accent">Cancel</button>
          <button type="button" onClick={() => submit('resolved')} className="h-11 rounded-full bg-success px-[18px] text-sm font-semibold text-success-foreground hover:bg-success/90">Mark solved</button>
          {selected.status !== 'problem' && <button type="button" onClick={() => submit('problem')} className="col-span-2 h-11 rounded-full border border-destructive/40 bg-surface-error px-[18px] text-sm font-semibold text-destructive hover:bg-destructive/15">Record as Problem</button>}
        </div>
      </div>}
    </AppDialog>
  </section>
}
