import { Clock3, History, LockKeyhole, RotateCcw, Undo2 } from 'lucide-react'
import { useEffect, useState, type FC } from 'react'
import {
  getFinancePeriodActions,
  subscribeFinancePeriodActionsChanged,
  type FinancePeriodAction,
  type FinancePeriodActionType,
} from '../../data/financePeriods'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useUiLanguage } from '../../i18n/uiLanguage'

type Tr = (en: string, id: string) => string

const actionLabel = (action: FinancePeriodActionType, tr: Tr): string => ({
  start_review: tr('Moved to Review', 'Masuk review'),
  return_open: tr('Returned to Open', 'Dibuka lagi'),
  close: tr('Closed period', 'Tutup buku'),
  reopen: tr('Reopened period', 'Dibuka ulang'),
})[action]

const statusLabel = (status: string, tr: Tr): string =>
  status === 'open' ? tr('Open', 'Terbuka') : status === 'review' ? 'Review' : status === 'closed' ? tr('Closed', 'Ditutup') : status

const ActionIcon: FC<{ action: FinancePeriodActionType }> = ({ action }) => {
  if (action === 'close') return <LockKeyhole className="size-3.5" />
  if (action === 'reopen') return <RotateCcw className="size-3.5" />
  if (action === 'return_open') return <Undo2 className="size-3.5" />
  return <Clock3 className="size-3.5" />
}

const formatAuditTime = (value: string, language: 'en' | 'id'): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

const formatMonth = (periodMonth: string, language: 'en' | 'id'): string => {
  const date = new Date(`${periodMonth.slice(0, 7)}-15T12:00:00+07:00`)
  return Number.isNaN(date.getTime())
    ? periodMonth.slice(0, 7)
    : new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date)
}

export const FinancePeriodAuditHistory: FC = () => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
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
      } catch {
        // The raw server message is technical (and English); show a plain one.
        if (active) setError('load_failed')
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
    <section className="rounded-xl border border-border/70 bg-card p-4" aria-label={tr('Accounting period audit history', 'Riwayat audit periode akuntansi')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">{tr('Period audit history', 'Riwayat audit periode')}</h3>
          </div>
        </div>
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">{tr('Read only', 'Hanya baca')}</span>
      </div>

      {loading ? (
        <p className="mt-4 text-xs text-muted-foreground">{tr('Loading period history…', 'Memuat riwayat periode…')}</p>
      ) : error ? (
        <p className="mt-4 text-xs text-destructive">{tr('Audit history could not be loaded.', 'Riwayat audit tidak bisa dimuat.')}</p>
      ) : actions.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">{tr('No recorded period actions yet.', 'Belum ada tindakan periode yang tercatat.')}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {actions.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/55 text-muted-foreground ring-1 ring-border/70">
                <ActionIcon action={entry.action} />
              </span>
              <div className="min-w-0 flex-1 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-xs font-semibold text-foreground">{actionLabel(entry.action, tr)} · {formatMonth(entry.periodMonth, language)}</p>
                  <time className="text-2xs text-muted-foreground">{formatAuditTime(entry.createdAt, language)} WIB</time>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.actorName} · {entry.actorRole} · {statusLabel(entry.fromStatus, tr)} → {statusLabel(entry.toStatus, tr)}
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
