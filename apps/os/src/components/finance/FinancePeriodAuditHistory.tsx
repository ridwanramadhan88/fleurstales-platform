import { Clock3, History, LockKeyhole, RotateCcw, Undo2 } from 'lucide-react'
import { useEffect, useState, type FC } from 'react'
import {
  getFinancePeriodActions,
  subscribeFinancePeriodActionsChanged,
  type FinancePeriodAction,
  type FinancePeriodActionType,
} from '../../data/financePeriods'

const actionLabel: Record<FinancePeriodActionType, string> = {
  start_review: 'Moved to Review',
  return_open: 'Returned to Open',
  close: 'Closed period',
  reopen: 'Reopened period',
}

const ActionIcon: FC<{ action: FinancePeriodActionType }> = ({ action }) => {
  if (action === 'close') return <LockKeyhole className="size-3.5" />
  if (action === 'reopen') return <RotateCcw className="size-3.5" />
  if (action === 'return_open') return <Undo2 className="size-3.5" />
  return <Clock3 className="size-3.5" />
}

const formatAuditTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

const formatMonth = (periodMonth: string): string => {
  const date = new Date(`${periodMonth.slice(0, 7)}-15T12:00:00+07:00`)
  return Number.isNaN(date.getTime())
    ? periodMonth.slice(0, 7)
    : new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date)
}

export const FinancePeriodAuditHistory: FC = () => {
  const [actions, setActions] = useState<FinancePeriodAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await getFinancePeriodActions(6)
        if (active) setActions(result)
      } catch (reason) {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Audit history could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    const unsubscribe = subscribeFinancePeriodActionsChanged(() => { void load() })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4" aria-label="Accounting period audit history">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Period audit history</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Status changes, actors, reasons, and Jakarta timestamps for the last six accounting months.</p>
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">Read only</span>
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-muted-foreground">Loading period history…</p>
      ) : error ? (
        <p className="mt-4 text-xs text-destructive">{error}</p>
      ) : actions.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No recorded period actions yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {actions.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/55 text-muted-foreground ring-1 ring-border/70">
                <ActionIcon action={entry.action} />
              </span>
              <div className="min-w-0 flex-1 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-xs font-semibold text-foreground">{actionLabel[entry.action]} · {formatMonth(entry.periodMonth)}</p>
                  <time className="text-2xs text-muted-foreground">{formatAuditTime(entry.createdAt)} WIB</time>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.actorName} · {entry.actorRole} · {entry.fromStatus} → {entry.toStatus}
                </p>
                {entry.reason && (
                  <p className="mt-1.5 rounded-md bg-muted/45 px-2.5 py-2 text-xs leading-relaxed text-foreground">
                    {entry.reason}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default FinancePeriodAuditHistory
