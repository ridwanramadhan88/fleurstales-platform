import { useMemo, type FC } from 'react'
import { ArrowDownRight, ArrowUpRight, Download, LockKeyhole, Scale, WalletCards } from 'lucide-react'
import type { FinancePeriodSummary } from '../../data/financePeriods'
import { buildFinancePeriodReport } from '../../domain/financePeriodReportDomain'
import { downloadFinancePeriodXlsx, buildFinancePeriodXlsx } from '../../lib/financePeriodXlsxExport'
import { useFinanceStore } from '../../store/financeStore'
import { useSettingsStore } from '../../store/settingsStore'

const CASH_ACCOUNT_ID = 'cash:main'
const LEGACY_ACCOUNT_ID = 'legacy:unassigned'

const formatIdr = (value: number): string => `${value < 0 ? '-' : ''}Rp ${Math.abs(Math.round(value)).toLocaleString('id-ID')}`

const formatMonth = (periodMonth: string): string => {
  const month = periodMonth.slice(0, 7)
  const date = new Date(`${month}-15T12:00:00+07:00`)
  return Number.isNaN(date.getTime())
    ? month
    : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(date)
}

const statusClass = (status: FinancePeriodSummary['status']): string =>
  status === 'closed'
    ? 'bg-success/10 text-success'
    : status === 'review'
      ? 'bg-warning/10 text-warning'
      : 'bg-muted text-muted-foreground'

export const FinancePeriodReport: FC<{ period: FinancePeriodSummary }> = ({ period }) => {
  const transactions = useFinanceStore((state) => state.transactions)
  const configuredAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const report = useMemo(
    () => buildFinancePeriodReport(transactions, period.periodMonth),
    [period.periodMonth, transactions],
  )

  const accountLabels = useMemo(() => new Map<string, string>([
    ...configuredAccounts.map((account) => [account.id, `${account.bankName} · ${account.accountNumber}`] as const),
    [CASH_ACCOUNT_ID, 'Cash'],
    [LEGACY_ACCOUNT_ID, 'Legacy / unassigned'],
  ]), [configuredAccounts])

  const accounts = useMemo(() => {
    const byId = new Map(report.accounts.map((account) => [account.accountId, account]))
    for (const account of configuredAccounts.filter((item) => item.isActive !== false)) {
      if (!byId.has(account.id)) {
        byId.set(account.id, { accountId: account.id, openingBalance: 0, moneyIn: 0, moneyOut: 0, closingBalance: 0, transactionCount: 0 })
      }
    }
    if (!byId.has(CASH_ACCOUNT_ID)) {
      byId.set(CASH_ACCOUNT_ID, { accountId: CASH_ACCOUNT_ID, openingBalance: 0, moneyIn: 0, moneyOut: 0, closingBalance: 0, transactionCount: 0 })
    }
    return [...byId.values()].sort((a, b) => {
      if (a.accountId === LEGACY_ACCOUNT_ID) return 1
      if (b.accountId === LEGACY_ACCOUNT_ID) return -1
      return (accountLabels.get(a.accountId) ?? a.accountId).localeCompare(accountLabels.get(b.accountId) ?? b.accountId)
    })
  }, [accountLabels, configuredAccounts, report.accounts])

  const exportWorkbook = () => {
    const workbook = buildFinancePeriodXlsx({
      report,
      transactions,
      accounts,
      accountLabels: Object.fromEntries(accountLabels),
      periodStatus: period.status,
    })
    downloadFinancePeriodXlsx(`fleurstales-finance-${period.periodMonth.slice(0, 7)}.xlsx`, workbook)
  }

  return (
    <section className="space-y-4" aria-label={`${formatMonth(period.periodMonth)} Finance report`}>
      <div className="rounded-xl border border-border/70 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{formatMonth(period.periodMonth)}</h3>
              <span className={`rounded-md px-2 py-0.5 text-2xs font-semibold ${statusClass(period.status)}`}>{period.status === 'closed' ? 'Closed' : period.status === 'review' ? 'Review' : 'Open'}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {report.transactionCount} verified ledger entr{report.transactionCount === 1 ? 'y' : 'ies'} in this period.
              {period.status === 'closed' ? ' Closed-period ledger history is locked, so this report remains reproducible.' : ' Open and Review reports update as the ledger changes.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={exportWorkbook}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold transition hover:bg-muted"
              aria-label={`Download ${formatMonth(period.periodMonth)} Finance report as Excel workbook`}
            >
              <Download className="size-3.5" /> XLSX
            </button>
            {period.status === 'closed' && (
              <div className="flex items-center gap-2 rounded-lg bg-success/5 px-3 py-2 text-xs text-success ring-1 ring-success/15">
                <LockKeyhole className="size-4" /> Locked ledger
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <ReportMetric label="Opening Balance" value={report.openingBalance} icon={WalletCards} />
        <ReportMetric label="Money In" helper="Operating" value={report.operatingMoneyIn} icon={ArrowDownRight} />
        <ReportMetric label="Money Out" helper="Operating" value={report.operatingMoneyOut} icon={ArrowUpRight} />
        <ReportMetric label="Net Cash Flow" helper="Operating" value={report.operatingNetCashFlow} icon={Scale} />
        <ReportMetric label="Balance Adjustments" helper="Opening balance + corrections" value={report.balanceAdjustments} icon={Scale} />
        <ReportMetric label="Closing Balance" value={report.closingBalance} icon={WalletCards} />
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <h4 className="text-sm font-semibold">Balance reconciliation</h4>
        <p className="mt-1 text-xs text-muted-foreground">Operating flow excludes account transfers, opening-balance entries, and balance corrections so cash flow is not artificially inflated.</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted/45 px-3 py-2 text-xs tabular-nums">
          <span>{formatIdr(report.openingBalance)} opening</span>
          <span className="text-muted-foreground">+</span>
          <span>{formatIdr(report.operatingNetCashFlow)} operating</span>
          <span className="text-muted-foreground">+</span>
          <span>{formatIdr(report.balanceAdjustments)} adjustments</span>
          <span className="text-muted-foreground">+</span>
          <span>{formatIdr(report.internalTransferNet)} transfer net</span>
          <span className="text-muted-foreground">=</span>
          <span className="font-semibold">{formatIdr(report.closingBalance)} closing</span>
        </div>
        {report.internalTransferNet !== 0 && (
          <p className="mt-2 text-xs text-warning">Internal transfers do not net to zero for this month. Review the transfer pairings before closing the period.</p>
        )}
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">By account / cash</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">Full ledger movement, including transfers and balance utilities, reconciled per account.</p>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border/70">
                <th className="px-2 py-2 font-medium">Account</th>
                <th className="px-2 py-2 text-right font-medium">Opening</th>
                <th className="px-2 py-2 text-right font-medium">In</th>
                <th className="px-2 py-2 text-right font-medium">Out</th>
                <th className="px-2 py-2 text-right font-medium">Closing</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.accountId} className="border-b border-border/40 last:border-0">
                  <td className="px-2 py-2.5"><span className="font-medium">{accountLabels.get(account.accountId) ?? account.accountId}</span><span className="ml-2 text-2xs text-muted-foreground">{account.transactionCount} entries</span></td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatIdr(account.openingBalance)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatIdr(account.moneyIn)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatIdr(account.moneyOut)}</td>
                  <td className={`px-2 py-2.5 text-right font-semibold tabular-nums ${account.closingBalance < 0 ? 'text-destructive' : ''}`}>{formatIdr(account.closingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card p-4">
        <h4 className="text-sm font-semibold">By source</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">Orders, refunds, payroll, manual entries, and internal transfers are kept distinct.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {report.sources.map((source) => (
            <div key={source.source} className="rounded-xl bg-surface-panel px-3 py-3 ring-1 ring-border/60">
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{source.label}</p><span className="text-2xs text-muted-foreground">{source.transactionCount}</span></div>
              <p className={`mt-2 text-sm font-semibold tabular-nums ${source.net < 0 ? 'text-destructive' : ''}`}>{formatIdr(source.net)}</p>
              <p className="mt-1 text-2xs text-muted-foreground">In {formatIdr(source.moneyIn)} · Out {formatIdr(source.moneyOut)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const ReportMetric: FC<{
  label: string
  helper?: string
  value: number
  icon: typeof WalletCards
}> = ({ label, helper, value, icon: Icon }) => (
  <div className="rounded-xl border border-border/70 bg-card p-4">
    <div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" /><span className="text-xs font-medium">{label}</span></div>
    <p className={`mt-2 text-lg font-semibold tabular-nums ${value < 0 ? 'text-destructive' : ''}`}>{formatIdr(value)}</p>
    {helper && <p className="mt-0.5 text-2xs text-muted-foreground">{helper}</p>}
  </div>
)

export default FinancePeriodReport