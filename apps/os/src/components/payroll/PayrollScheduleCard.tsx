import { useEffect, useState, type FC } from 'react'
import { CalendarDays, CircleCheck, Landmark, WalletCards } from 'lucide-react'
import { usePayrollStore, type PayrollPeriod } from '../../store/payrollStore'
import { StatusChip, type ChipTone } from '../ui/chip'
import { surfaceCardClass } from '../ui/card'

const formatDate = (value:string) => new Intl.DateTimeFormat('en-GB', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Jakarta' }).format(new Date(`${value}T12:00:00+07:00`))
const statusLabel: Record<PayrollPeriod['status'], string> = { upcoming:'Upcoming', hr_preparation:'HR preparation', finance_review:'Finance review', payment_due:'Ready for payment', overdue:'Overdue' }
const statusTone: Record<PayrollPeriod['status'], ChipTone> = { upcoming:'neutral', hr_preparation:'info', finance_review:'warning', payment_due:'success', overdue:'destructive' }

const milestones = [
  { key:'hrSubmissionDeadline', label:'HR submission', icon:CircleCheck },
  { key:'financeReviewDeadline', label:'Finance review', icon:Landmark },
  { key:'paymentDate', label:'Payment date', icon:WalletCards },
] as const

export const PayrollScheduleCard: FC<{ title?:string; period?: PayrollPeriod | null }> = ({ title='Payroll cycle', period: providedPeriod }) => {
  const ensureCurrentPeriod = usePayrollStore((state) => state.ensureCurrentPeriod)
  const [periodState, setPeriod] = useState<PayrollPeriod | null>(null)
  useEffect(() => { if (!providedPeriod) setPeriod(ensureCurrentPeriod()) }, [ensureCurrentPeriod, providedPeriod])
  const period = providedPeriod ?? periodState
  if (!period) return null

  return <section aria-label="Payroll schedule" className={surfaceCardClass('standard')}>
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="size-5" /></span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-6">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{formatDate(period.periodStart)} – {formatDate(period.periodEnd)}</p>
        </div>
      </div>
      <StatusChip tone={statusTone[period.status]} className="shrink-0">{statusLabel[period.status]}</StatusChip>
    </div>

    <div className="mt-3 grid gap-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border/70">
      {milestones.map(({ key, label, icon:Icon }) => <div key={key} className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-panel px-3 py-3 sm:rounded-none sm:bg-transparent sm:px-4 sm:first:pl-0 sm:last:pr-0">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-primary ring-1 ring-border"><Icon className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-sm font-semibold leading-tight sm:text-base">{formatDate(period[key])}</p>
        </div>
      </div>)}
    </div>
  </section>
}
