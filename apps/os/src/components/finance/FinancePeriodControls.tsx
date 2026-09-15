import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { BarChart3, CalendarRange, CheckCircle2, ChevronLeft, LockKeyhole, RotateCcw, ShieldAlert } from 'lucide-react'
import { isActionAuthorized } from '../../config/authorization'
import {
  getFinancePeriods,
  setFinancePeriodStatus,
  type FinancePeriodStatus,
  type FinancePeriodSummary,
} from '../../data/financePeriods'
import { toast } from '../../hooks/use-toast'
import { useUserStore } from '../../store/userStore'
import { AppDialog } from '../ui/app-dialog'
import { AppSheet } from '../ui/app-sheet'
import { FinancePeriodReport } from './FinancePeriodReport'

const jakartaMonthKey = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  return `${year}-${month}`
}

const formatMonth = (periodMonth: string): string => {
  const month = periodMonth.slice(0, 7)
  const date = new Date(`${month}-15T12:00:00+07:00`)
  return Number.isNaN(date.getTime())
    ? month
    : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date)
}

const statusLabel: Record<FinancePeriodStatus, string> = {
  open: 'Open',
  review: 'Review',
  closed: 'Closed',
}

const blockerItems = (period: FinancePeriodSummary) => [
  ['Order reconciliation', period.blockers.reconciliation],
  ['Pending refunds', period.blockers.refunds],
  ['Payroll', period.blockers.payroll],
  ['Legacy accounts', period.blockers.legacyAccounts],
  ['Pending transactions', period.blockers.pendingTransactions],
] as const

interface PendingPeriodAction {
  period: FinancePeriodSummary
  target: 'closed' | 'open'
}

export const FinancePeriodControls: FC = () => {
  const role = useUserStore((state) => state.role)
  const [periods, setPeriods] = useState<FinancePeriodSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyMonth, setBusyMonth] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reportMonth, setReportMonth] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingPeriodAction | null>(null)
  const [reason, setReason] = useState('')

  const canClose = role === 'finance' && isActionAuthorized(role, 'finance.close_period')
  const canReopen = role === 'finance' && isActionAuthorized(role, 'finance.reopen_period')
  const currentMonth = useMemo(jakartaMonthKey, [])

  const refresh = useCallback(async () => {
    if (role !== 'finance') return
    setLoading(true)
    try {
      setPeriods(await getFinancePeriods(6))
    } catch (error) {
      toast({
        title: 'Accounting periods could not be loaded',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => { void refresh() }, [refresh])

  if (role !== 'finance') return null

  const current = periods[0]
  const reportPeriod = reportMonth ? periods.find((period) => period.periodMonth === reportMonth) : undefined

  const openPeriods = () => {
    setReportMonth(null)
    setSheetOpen(true)
  }

  const openReport = (periodMonth: string) => {
    setReportMonth(periodMonth)
    setSheetOpen(true)
  }

  const changeStatus = async (period: FinancePeriodSummary, status: FinancePeriodStatus, actionReason?: string) => {
    if (busyMonth) return
    setBusyMonth(period.periodMonth)
    try {
      await setFinancePeriodStatus({ periodMonth: period.periodMonth, status, reason: actionReason })
      await refresh()
      toast({
        title: status === 'closed'
          ? `${formatMonth(period.periodMonth)} closed`
          : period.status === 'closed'
            ? `${formatMonth(period.periodMonth)} reopened`
            : status === 'review'
              ? `${formatMonth(period.periodMonth)} moved to Review`
              : `${formatMonth(period.periodMonth)} returned to Open`,
      })
    } catch (error) {
      toast({
        title: 'Accounting period was not changed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setBusyMonth(null)
    }
  }

  const confirmReasonedAction = async () => {
    if (!pendingAction || reason.trim().length < 3) return
    const action = pendingAction
    setPendingAction(null)
    const actionReason = reason.trim()
    setReason('')
    await changeStatus(action.period, action.target, actionReason)
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <CalendarRange className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Accounting period</p>
              {current && (
                <span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${current.status === 'closed' ? 'bg-success/10 text-success' : current.status === 'review' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                  {statusLabel[current.status]}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {loading ? 'Loading period controls…' : current ? `${formatMonth(current.periodMonth)} · ${current.blockerTotal} close blocker${current.blockerTotal === 1 ? '' : 's'}` : 'No period data available'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {current && (
            <button type="button" onClick={() => openReport(current.periodMonth)} className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold ring-1 ring-border/70 transition hover:bg-muted">
              <BarChart3 className="size-3.5" /> View report
            </button>
          )}
          <button type="button" onClick={openPeriods} className="h-9 rounded-lg px-3 text-xs font-semibold ring-1 ring-border/70 transition hover:bg-muted">
            Manage periods
          </button>
        </div>
      </div>

      <AppSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open) setReportMonth(null)
        }}
        side="responsiveRight"
        size="wide"
        title={reportPeriod ? `${formatMonth(reportPeriod.periodMonth)} report` : 'Accounting periods'}
        description={reportPeriod
          ? 'Period balances, operating cash flow, account movement, and source breakdown from the verified Finance ledger.'
          : 'Review and close completed months. Closed periods freeze their Finance ledger history until an authorized reopen.'}
      >
        {reportPeriod ? (
          <div className="space-y-4 overflow-y-auto px-4 pb-6 pt-4 sm:px-5">
            <button type="button" onClick={() => setReportMonth(null)} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <ChevronLeft className="size-4" /> Back to periods
            </button>
            <FinancePeriodReport period={reportPeriod} />
          </div>
        ) : (
          <div className="space-y-3 overflow-y-auto px-4 pb-6 pt-4 sm:px-5">
            {loading && <p className="text-sm text-muted-foreground">Loading accounting periods…</p>}
            {!loading && periods.map((period) => {
              const monthKey = period.periodMonth.slice(0, 7)
              const isCurrent = monthKey === currentMonth
              const busy = busyMonth === period.periodMonth
              const blockers = blockerItems(period).filter(([, count]) => count > 0)
              return (
                <article key={period.periodMonth} className="rounded-xl border border-border/70 bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{formatMonth(period.periodMonth)}</h3>
                        <span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${period.status === 'closed' ? 'bg-success/10 text-success' : period.status === 'review' ? 'bg-warning/10 text-warning' : 'bg-muted text-muted-foreground'}`}>
                          {statusLabel[period.status]}
                        </span>
                        {isCurrent && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">Current</span>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {period.status === 'closed'
                          ? `Closed${period.closedBy ? ` by ${period.closedBy}` : ''}${period.closedAt ? ` · ${new Date(period.closedAt).toLocaleDateString('en-GB')}` : ''}`
                          : period.blockerTotal === 0
                            ? 'Close checklist is clear.'
                            : `${period.blockerTotal} item${period.blockerTotal === 1 ? '' : 's'} must be resolved before close.`}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setReportMonth(period.periodMonth)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold">
                        <BarChart3 className="size-3.5" /> View report
                      </button>
                      {period.status === 'open' && canClose && (
                        <button type="button" disabled={busy} onClick={() => void changeStatus(period, 'review')} className="h-9 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50">
                          Start review
                        </button>
                      )}
                      {period.status === 'review' && canClose && (
                        <>
                          <button type="button" disabled={busy} onClick={() => void changeStatus(period, 'open')} className="h-9 rounded-lg px-3 text-xs font-semibold text-muted-foreground disabled:opacity-50">
                            Return to Open
                          </button>
                          {!isCurrent && (
                            <button
                              type="button"
                              disabled={busy || period.blockerTotal > 0}
                              onClick={() => { setReason(''); setPendingAction({ period, target:'closed' }) }}
                              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-45"
                            >
                              <LockKeyhole className="size-3.5" /> Close month
                            </button>
                          )}
                        </>
                      )}
                      {period.status === 'closed' && canReopen && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { setReason(''); setPendingAction({ period, target:'open' }) }}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50"
                        >
                          <RotateCcw className="size-3.5" /> Reopen
                        </button>
                      )}
                    </div>
                  </div>

                  {period.status === 'review' && isCurrent && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/55 px-3 py-2 text-xs text-muted-foreground">
                      <ShieldAlert className="size-4 shrink-0" /> Current month can be reviewed now, but it cannot be closed until the month has ended.
                    </div>
                  )}

                  {blockers.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {blockers.map(([label, count]) => (
                        <span key={label} className="rounded-md bg-warning/10 px-2 py-1 text-2xs font-medium text-warning">{label}: {count}</span>
                      ))}
                    </div>
                  ) : period.status !== 'closed' ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-success"><CheckCircle2 className="size-4" /> No close blockers.</div>
                  ) : null}

                  {period.status === 'closed' && !canReopen && (
                    <p className="mt-3 text-xs text-muted-foreground">Reopening requires the separately granted <span className="font-medium text-foreground">Reopen Accounting Period</span> permission and an audit reason.</p>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </AppSheet>

      <AppDialog
        open={pendingAction !== null}
        onOpenChange={(open) => { if (!open && !busyMonth) { setPendingAction(null); setReason('') } }}
        size="standard"
        title={pendingAction?.target === 'closed' ? 'Close accounting period' : 'Reopen accounting period'}
        description={pendingAction
          ? pendingAction.target === 'closed'
            ? `Close ${formatMonth(pendingAction.period.periodMonth)} and freeze its Finance ledger history.`
            : `Reopen ${formatMonth(pendingAction.period.periodMonth)}. This action is audited.`
          : ''}
      >
        <div className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium">
            Reason
            <textarea
              aria-label="Accounting period reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={pendingAction?.target === 'closed' ? 'Month-end review completed.' : 'Explain why this closed month must be reopened.'}
              className="min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-foreground/40 focus:ring-2 focus:ring-foreground/10"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setPendingAction(null); setReason('') }} className="h-10 rounded-lg px-4 text-sm font-semibold">Cancel</button>
            <button
              type="button"
              disabled={reason.trim().length < 3 || Boolean(busyMonth)}
              onClick={() => void confirmReasonedAction()}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45"
            >
              {pendingAction?.target === 'closed' ? 'Close month' : 'Reopen month'}
            </button>
          </div>
        </div>
      </AppDialog>
    </>
  )
}

export default FinancePeriodControls
