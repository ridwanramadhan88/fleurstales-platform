import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { DatePickerField } from '../ui/date-time-field'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../ui/sheet'
import { usePayrollStore, type PayrollPeriod } from '../../store/payrollStore'
import { useUserStore } from '../../store/userStore'
import { useSettingsStore } from '../../store/settingsStore'
import { hasActionPermission } from '../../config/actionPermissions'
import type { PayrollScheduleSnapshot } from '../../domain/payrollScheduleDomain'
import { formatHumanDate } from '../../lib/humanDates'
import { useBilingualCopy } from '../../i18n/bilingualCopy'

// Same readable dates as the rest of the app ("24 Okt 2026").
const formatDate = (value: string) => formatHumanDate(value)
const fields:Array<{ key:keyof PayrollScheduleSnapshot; label:string }> = [
  { key:'periodStart', label:'Period start' }, { key:'periodEnd', label:'Period end' }, { key:'hrSubmissionDeadline', label:'HR submission' }, { key:'financeReviewDeadline', label:'Finance review' }, { key:'paymentDate', label:'Payment date' },
]
const snapshot = (period:PayrollPeriod):PayrollScheduleSnapshot => ({ periodStart:period.periodStart, periodEnd:period.periodEnd, hrSubmissionDeadline:period.hrSubmissionDeadline, financeReviewDeadline:period.financeReviewDeadline, paymentDate:period.paymentDate })

export const FinancePayrollScheduleAdjustment = () => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const permissions = useSettingsStore((state) => state.permissions)
  const actionPermissions = useSettingsStore((state) => state.actionPermissions)
  const periods = usePayrollStore((state) => state.periods)
  const ensureCurrentPeriod = usePayrollStore((state) => state.ensureCurrentPeriod)
  const adjust = usePayrollStore((state) => state.adjustPayrollSchedule)
  const [periodId, setPeriodId] = useState('')
  const [editing, setEditing] = useState(false)
  const [proposed, setProposed] = useState<PayrollScheduleSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const tr = useBilingualCopy()

  useEffect(() => { const period = ensureCurrentPeriod(); setPeriodId((current) => current || period.id) }, [ensureCurrentPeriod])
  const period = periods.find((item) => item.id === periodId) ?? periods.slice().sort((a,b) => b.paymentDate.localeCompare(a.paymentDate))[0]
  const canEdit = hasActionPermission(role, 'finance.adjust_payroll_schedule', actionPermissions, permissions)
  const openEditor = () => { if (!period || !canEdit) return; setProposed(snapshot(period)); setError(null); setFieldErrors({}); setMessage(null); setEditing(true) }
  const save = () => {
    if (!period || !proposed || !canEdit) return
    const result = adjust({ payrollPeriodId:period.id, proposed, reason:'', actor:{ name:actorName, role } })
    if (!result.ok) { setError(result.reason); setFieldErrors(result.fieldErrors ?? {}); return }
    setEditing(false); setError(null); setFieldErrors({}); setMessage('Payroll schedule updated.')
  }
  if (!period) return null
  // One line: the next payment date and the review deadline; details on demand.
  return <section aria-label="Payroll schedule" className="rounded-xl bg-card px-4 py-3 ring-1 ring-border/60">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((value) => !value)} className="flex min-w-0 items-center gap-3 text-left">
        <CalendarClock className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{tr('Payday', 'Gajian')} {formatDate(period.paymentDate)}</span>
          <span className="block truncate text-xs text-muted-foreground">{tr('Finance review by', 'Review Finance paling lambat')} {formatDate(period.financeReviewDeadline)}</span>
        </span>
      </button>
      {canEdit && <button type="button" onClick={openEditor} className="h-10 rounded-full border border-border px-4 text-sm font-semibold">{tr('Edit schedule', 'Ubah jadwal')}</button>}
    </div>
    {detailsOpen && <dl className="mt-3 grid gap-2 sm:grid-cols-2">{fields.map(({ key,label }) => <div key={key} className="flex min-h-11 items-center justify-between gap-4 rounded-lg bg-muted/25 px-3 py-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="shrink-0 text-sm font-semibold">{formatDate(period[key])}</dd></div>)}</dl>}
    {detailsOpen && period.lastAdjustedAt && <p className="mt-2 text-xs text-muted-foreground">Last updated by {period.lastAdjustedBy} · {new Date(period.lastAdjustedAt).toLocaleString('id-ID')}</p>}
    {message && <p className="mt-3 rounded-lg bg-success/10 p-2.5 text-xs text-success">{message}</p>}
    <Sheet open={editing} onOpenChange={setEditing}>
      <SheetContent side="right" className="flex w-full flex-col sm:w-[min(40rem,88vw)] sm:max-w-none md:w-[min(44rem,72vw)]">
        <SheetHeader><SheetTitle>Edit payroll schedule</SheetTitle><SheetDescription>Changes apply immediately after validation and are kept in the audit history.</SheetDescription></SheetHeader>
        {proposed && <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">{fields.map(({ key,label }) => <label key={key} className="block space-y-1.5"><span className="text-sm font-medium">{label}</span><DatePickerField value={proposed[key]} onChange={(value) => setProposed((current) => current ? { ...current, [key]:value } : current)} />{fieldErrors[key] && <p className="text-xs text-destructive">{fieldErrors[key]}</p>}</label>)}</div>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <SheetFooter className="mt-auto"><button type="button" onClick={() => setEditing(false)} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium">Cancel</button><button type="button" onClick={save} className="h-11 rounded-full bg-foreground px-[18px] text-sm font-semibold text-background">Save schedule</button></SheetFooter>
      </SheetContent>
    </Sheet>
  </section>
}
