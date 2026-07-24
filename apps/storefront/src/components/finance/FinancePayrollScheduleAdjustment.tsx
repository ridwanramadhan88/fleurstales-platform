import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { DatePickerField } from '../ui/date-time-field'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '../ui/sheet'
import { usePayrollStore, type PayrollPeriod } from '../../store/payrollStore'
import { useUserStore } from '../../store/userStore'
import type { PayrollScheduleSnapshot } from '../../domain/payrollScheduleDomain'

const formatDate = (value:string) => new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Jakarta' }).format(new Date(`${value}T12:00:00+07:00`))
const fields:Array<{ key:keyof PayrollScheduleSnapshot; label:string }> = [
  { key:'periodStart', label:'Period start' }, { key:'periodEnd', label:'Period end' }, { key:'hrSubmissionDeadline', label:'HR submission' }, { key:'financeReviewDeadline', label:'Finance review' }, { key:'paymentDate', label:'Payment date' },
]
const snapshot = (period:PayrollPeriod):PayrollScheduleSnapshot => ({ periodStart:period.periodStart, periodEnd:period.periodEnd, hrSubmissionDeadline:period.hrSubmissionDeadline, financeReviewDeadline:period.financeReviewDeadline, paymentDate:period.paymentDate })

export const FinancePayrollScheduleAdjustment = () => {
  const role = useUserStore((state) => state.role)
  const actorName = useUserStore((state) => state.name)
  const periods = usePayrollStore((state) => state.periods)
  const ensureCurrentPeriod = usePayrollStore((state) => state.ensureCurrentPeriod)
  const adjust = usePayrollStore((state) => state.adjustPayrollSchedule)
  const [periodId, setPeriodId] = useState('')
  const [editing, setEditing] = useState(false)
  const [proposed, setProposed] = useState<PayrollScheduleSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({})
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { const period = ensureCurrentPeriod(); setPeriodId((current) => current || period.id) }, [ensureCurrentPeriod])
  const period = periods.find((item) => item.id === periodId) ?? periods.slice().sort((a,b) => b.paymentDate.localeCompare(a.paymentDate))[0]
  const canEdit = role === 'finance' || role === 'owner'
  const openEditor = () => { if (!period) return; setProposed(snapshot(period)); setError(null); setFieldErrors({}); setMessage(null); setEditing(true) }
  const save = () => {
    if (!period || !proposed) return
    const result = adjust({ payrollPeriodId:period.id, proposed, reason:'', actor:{ name:actorName, role } })
    if (!result.ok) { setError(result.reason); setFieldErrors(result.fieldErrors ?? {}); return }
    setEditing(false); setError(null); setFieldErrors({}); setMessage('Payroll schedule updated.')
  }
  if (!period) return null
  return <section aria-label="Payroll schedule" className="rounded-2xl bg-card p-5 ring-1 ring-border/60 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarClock className="size-5" /></span>
        <div className="min-w-0"><h2 className="text-base font-semibold leading-6">Payroll schedule</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">Active payroll cycle and operational deadlines.</p></div>
      </div>
      {canEdit && <button type="button" onClick={openEditor} className="h-11 rounded-full bg-foreground px-[18px] text-sm font-semibold text-background">Edit schedule</button>}
    </div>
    <dl className="mt-5 grid gap-2 sm:grid-cols-2">{fields.map(({ key,label }, index) => <div key={key} className={`flex min-h-14 items-center justify-between gap-4 rounded-xl bg-muted/25 px-4 py-3 ${index === fields.length - 1 ? 'sm:col-span-2' : ''}`}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="shrink-0 text-sm font-semibold sm:text-base">{formatDate(period[key])}</dd></div>)}</dl>
    {period.lastAdjustedAt && <p className="mt-3 text-xs text-muted-foreground">Last updated by {period.lastAdjustedBy} · {new Date(period.lastAdjustedAt).toLocaleString('id-ID')}</p>}
    {message && <p className="mt-4 rounded-lg bg-success/10 p-3 text-sm text-success">{message}</p>}
    <Sheet open={editing} onOpenChange={setEditing}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader><SheetTitle>Edit payroll schedule</SheetTitle><SheetDescription>Changes apply immediately after validation.</SheetDescription></SheetHeader>
        {proposed && <div className="mt-5 flex-1 space-y-4 overflow-y-auto pr-1">{fields.map(({ key,label }) => <label key={key} className="block space-y-1.5"><span className="text-sm font-medium">{label}</span><DatePickerField value={proposed[key]} onChange={(value) => setProposed((current) => current ? { ...current, [key]:value } : current)} />{fieldErrors[key] && <p className="text-xs text-destructive">{fieldErrors[key]}</p>}</label>)}</div>}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <SheetFooter className="mt-auto"><button type="button" onClick={() => setEditing(false)} className="h-11 rounded-full border border-border px-[18px] text-sm font-medium">Cancel</button><button type="button" onClick={save} className="h-11 rounded-full bg-foreground px-[18px] text-sm font-semibold text-background">Save schedule</button></SheetFooter>
      </SheetContent>
    </Sheet>
  </section>
}
