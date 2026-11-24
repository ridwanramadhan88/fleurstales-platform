/**
 * @file FinanceReportTab.tsx
 * @description Everything about one month in one place: the accounting
 * period's status and closing, the LK report, the balance reconciliation per
 * account, and the period audit history.
 */

import { useCallback, useEffect, useState, type FC, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  getFinancePeriods,
  setFinancePeriodStatus,
  type FinancePeriodStatus,
  type FinancePeriodSummary,
} from '../../data/financePeriods'
import { formatMonthKey } from '../../domain/financeDates'
import { toast } from '../../hooks/use-toast'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { useUiLanguage } from '../../i18n/uiLanguage'
import { FinanceLkReportPanel } from './FinanceLkReportPanel'
import { FinancePeriodAuditHistory } from './FinancePeriodAuditHistory'
import { FinancePeriodReport } from './FinancePeriodReport'
import { FinancePeriodStatusCard } from './FinancePeriodStatusCard'
import { useFinanceUiStore } from './financeUiStore'
import type { FinanceAccess } from './useFinanceAccess'

const Collapsible: FC<{ title: string; children: ReactNode }> = ({ title, children }) => {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl bg-card ring-1 ring-border/60">
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold">
        {title}
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div className="border-t border-border/60 p-4">{children}</div>}
    </section>
  )
}

export const FinanceReportTab: FC<{ access: FinanceAccess }> = ({ access }) => {
  const tr = useBilingualCopy()
  const language = useUiLanguage((state) => state.language)
  const month = useFinanceUiStore((state) => state.month)
  const [periods, setPeriods] = useState<FinancePeriodSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setPeriods(await getFinancePeriods(12))
    } catch (error) {
      toast({ title: tr('Periods could not be loaded', 'Periode gagal dimuat'), description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
    // tr only changes with the language; reloading on that is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const period = periods.find((item) => item.periodMonth.slice(0, 7) === month) ?? null
  const monthLabel = formatMonthKey(month, language)

  const changeStatus = async (status: FinancePeriodStatus, reason?: string) => {
    if (!period || busy) return
    setBusy(true)
    try {
      await setFinancePeriodStatus({ periodMonth: period.periodMonth, status, reason })
      await refresh()
      toast({
        title: status === 'closed'
          ? tr(`${monthLabel} closed`, `${monthLabel} ditutup`)
          : status === 'review'
            ? tr(`${monthLabel} in review`, `${monthLabel} masuk review`)
            : tr(`${monthLabel} open`, `${monthLabel} dibuka`),
      })
    } catch (error) {
      toast({ title: tr('Period was not changed', 'Periode gagal diubah'), description: error instanceof Error ? error.message : undefined, variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <FinancePeriodStatusCard
        period={period}
        loading={loading}
        canClose={access.canClosePeriod}
        canReopen={access.canReopenPeriod}
        busy={busy}
        onChangeStatus={changeStatus}
      />
      <FinanceLkReportPanel month={month} />
      {period && (
        <Collapsible title={tr('Balances per account & sources', 'Saldo per rekening & sumber')}>
          <FinancePeriodReport period={period} />
        </Collapsible>
      )}
      {/* The history already has its own card and heading. */}
      <FinancePeriodAuditHistory />
    </div>
  )
}
