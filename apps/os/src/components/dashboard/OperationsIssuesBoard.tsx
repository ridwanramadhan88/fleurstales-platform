/**
 * @file OperationsIssuesBoard.tsx
 * @description Manager view of late orders and problems reported on orders.
 * Late orders are computed from order timestamps; issues are reported by
 * Admin/Florist and closed here with a short resolution note.
 */

import { useEffect, useMemo, useState, type FC } from 'react'
import { AlertTriangle, ChevronDown, RefreshCw } from 'lucide-react'
import { todayIsoDate } from '../../store/hrStore'
import { fetchOperationsOverview, resolveOrderIssue } from '../../data/orderIssuesSupabase'
import { formatLateness, getIssueKindLabel, groupLateOrdersBy, isValidIssueNote, summarizeLateOrders, type OperationsOverview } from '../../domain/orderIssueDomain'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { StatusChip } from '../ui/chip'
import { surfaceCardClass } from '../ui/card'

const shiftDate = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const EMPTY: OperationsOverview = { from: '', to: '', lateOrders: [], issues: [] }

export const OperationsIssuesBoard: FC = () => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const today = todayIsoDate()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'issues' | 'late'>('issues')
  const [rangeDays, setRangeDays] = useState(7)
  const [overview, setOverview] = useState<OperationsOverview>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const result = await fetchOperationsOverview(shiftDate(today, -(rangeDays - 1)), today)
        if (!cancelled) setOverview(result)
      } catch {
        if (!cancelled) {
          setOverview(EMPTY)
          setError(tr('Could not load late orders and issues. Try again.', 'Pesanan terlambat dan kendala tidak bisa dimuat. Coba lagi.'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeDays, reloadKey, today])

  const summary = useMemo(() => summarizeLateOrders(overview.lateOrders), [overview.lateOrders])
  const florists = useMemo(() => groupLateOrdersBy(overview.lateOrders, 'floristName'), [overview.lateOrders])
  const couriers = useMemo(() => groupLateOrdersBy(overview.lateOrders, 'courierName'), [overview.lateOrders])
  const openIssues = overview.issues.filter((issue) => issue.status === 'open')

  const summaryLine = loading
    ? tr('Loading…', 'Memuat…')
    : `${openIssues.length} ${tr('open issues', 'kendala terbuka')} · ${summary.total} ${tr('late orders', 'pesanan terlambat')}`

  const submitResolve = async (issueId: string) => {
    setSaving(true)
    setError(null)
    try {
      await resolveOrderIssue(issueId, resolutionNote)
      setResolvingId(null)
      setResolutionNote('')
      setReloadKey((value) => value + 1)
    } catch {
      setError(tr('Could not close the issue. Try again.', 'Kendala tidak bisa ditutup. Coba lagi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-label={tr('Late orders and issues', 'Keterlambatan dan kendala')} data-testid="operations-issues-board" className={surfaceCardClass('standard')}>
      <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 shrink-0 text-primary" />
            <h2 className="text-sm font-semibold leading-5">{tr('Late orders & issues', 'Keterlambatan & kendala')}</h2>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{summaryLine}</p>
        </div>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-4 border-t border-border/70 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['issues', 'late'] as const).map((id) => (
              <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}
                className={`min-h-10 rounded-full px-3.5 text-sm font-medium ${tab === id ? 'bg-primary text-primary-foreground' : 'bg-surface-panel text-foreground'}`}>
                {id === 'issues' ? tr('Issues', 'Kendala') : tr('Late orders', 'Terlambat')}
              </button>
            ))}
            <select aria-label={tr('Period', 'Periode')} value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
              <option value={7}>{tr('Last 7 days', '7 hari terakhir')}</option>
              <option value={30}>{tr('Last 30 days', '30 hari terakhir')}</option>
            </select>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading} aria-label={tr('Refresh', 'Muat ulang')} className="flex size-10 items-center justify-center rounded-full border border-border disabled:opacity-50">
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

          {tab === 'issues' && (
            <>
              {!loading && !error && overview.issues.length === 0 && <p className="text-sm text-muted-foreground">{tr('No issues reported.', 'Belum ada kendala dilaporkan.')}</p>}
              <ul className="space-y-2">
                {overview.issues.map((issue) => (
                  <li key={issue.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone={issue.status === 'open' ? 'warning' : 'success'}>{issue.status === 'open' ? tr('Open', 'Terbuka') : tr('Resolved', 'Selesai')}</StatusChip>
                      <span className="text-sm font-semibold">{getIssueKindLabel(issue.kind, language)}</span>
                      <span className="text-xs text-muted-foreground">{issue.orderNumber}{issue.branchName ? ` · ${issue.branchName}` : ''}</span>
                    </div>
                    <p className="mt-1.5 text-sm">{issue.note}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{tr('Reported by', 'Dilaporkan oleh')} {issue.reportedByName}</p>
                    {issue.status === 'resolved' && issue.resolutionNote && <p className="mt-1 text-xs text-muted-foreground">{tr('Resolution', 'Penyelesaian')}: {issue.resolutionNote}</p>}
                    {issue.status === 'open' && resolvingId !== issue.id && (
                      <button type="button" onClick={() => { setResolvingId(issue.id); setResolutionNote('') }} className="mt-2 min-h-10 text-sm font-medium text-primary underline">{tr('Close issue', 'Tutup kendala')}</button>
                    )}
                    {resolvingId === issue.id && (
                      <div className="mt-2 space-y-2">
                        <textarea value={resolutionNote} rows={2} maxLength={500} aria-label={tr('How was it resolved?', 'Bagaimana penyelesaiannya?')} placeholder={tr('How was it resolved?', 'Bagaimana penyelesaiannya?')} onChange={(event) => setResolutionNote(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                        <div className="flex gap-2">
                          <button type="button" disabled={saving || !isValidIssueNote(resolutionNote)} onClick={() => void submitResolve(issue.id)} className="min-h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{tr('Save', 'Simpan')}</button>
                          <button type="button" onClick={() => setResolvingId(null)} className="min-h-10 rounded-full border border-border px-4 text-sm">{tr('Cancel', 'Batal')}</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'late' && (
            <>
              {!loading && !error && overview.lateOrders.length === 0 && <p className="text-sm text-muted-foreground">{tr('No late orders in this period.', 'Tidak ada pesanan terlambat pada periode ini.')}</p>}
              {summary.total > 0 && (
                <p className="text-xs text-muted-foreground">
                  {tr('Average', 'Rata-rata')} {formatLateness(summary.averageMinutes, language)} · {tr('worst', 'terlama')} {formatLateness(summary.worstMinutes, language)}{summary.ongoing ? ` · ${summary.ongoing} ${tr('still open', 'masih berjalan')}` : ''}
                </p>
              )}
              {(florists.length > 0 || couriers.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[{ title: tr('By florist', 'Per florist'), rows: florists }, { title: tr('By courier', 'Per kurir'), rows: couriers }].filter((group) => group.rows.length > 0).map((group) => (
                    <div key={group.title}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                      <ul className="mt-1 space-y-1 text-sm">
                        {group.rows.map((row) => <li key={row.name} className="flex justify-between gap-2"><span className="truncate">{row.name}</span><span className="shrink-0 text-muted-foreground">{row.count}× · {formatLateness(row.averageMinutes, language)}</span></li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              <ul className="space-y-2">
                {overview.lateOrders.map((order) => (
                  <li key={order.orderId} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{order.orderNumber}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[order.branchName, order.fulfillment === 'delivery' ? tr('Delivery', 'Antar') : tr('Pickup', 'Ambil'), order.floristName, order.courierName].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusChip tone={order.ongoing ? 'danger' : 'warning'}>{formatLateness(order.minutesLate, language)}</StatusChip>
                      {order.openIssues > 0 && <p className="mt-1 text-xs text-muted-foreground">{order.openIssues} {tr('issue', 'kendala')}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
