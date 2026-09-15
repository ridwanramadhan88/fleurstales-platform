import { Clock3, History, LockKeyhole, RotateCcw, Undo2 } from 'lucide-react'
import type { FC } from 'react'
import type { FinancePeriodAction, FinancePeriodActionType } from '../../data/financePeriods'

interface Props {
  actions: FinancePeriodAction[]
  loading?: boolean
}

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

export const FinancePeriodAuditHistory: FC<Props> = ({ actions, loading = false }) => (
  <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <History className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold">Audit history</p>
      </div>
      <span className="rounded-md bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">Read only</span>
    </div>

    {loading ? (
      <p className="mt-3 text-xs text-muted-foreground">Loading period history…</p>
    ) : actions.length === 0 ? (
      <p className="mt-3 text-xs text-muted-foreground">No recorded period actions yet.</p>
    ) : (
      <ol className="mt-3 space-y-3">
        {actions.map((entry) => (
          <li key={entry.id} className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border/70">
              <ActionIcon action={entry.action} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-xs font-semibold text-foreground">{actionLabel[entry.action]}</p>
                <time className="text-2xs text-muted-foreground">{formatAuditTime(entry.createdAt)} WIB</time>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.actorName} · {entry.actorRole} · {entry.fromStatus} → {entry.toStatus}
              </p>
              {entry.reason && (
                <p className="mt-1.5 rounded-md bg-background px-2.5 py-2 text-xs leading-relaxed text-foreground ring-1 ring-border/60">
                  {entry.reason}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    )}
  </div>
)

export default FinancePeriodAuditHistory
