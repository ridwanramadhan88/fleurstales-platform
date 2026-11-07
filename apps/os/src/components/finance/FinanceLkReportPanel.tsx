import { useCallback, useEffect, useMemo, useState, type FC } from 'react'
import { Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react'
import { useOrdersStore } from '../../store/ordersStore'
import { useCatalogStore } from '../../store/catalogStore'
import { useSettingsStore } from '../../store/settingsStore'
import { fetchFinanceReportLedger, type FinanceReportLedger } from '../../data/financeReport'
import type { FinanceCategory } from '../../store/financeStoreTypes'
import { getFinanceCategoryLabel } from '../../domain/financeTransactionCategoryDomain'
import {
  LK_BRAND_BY_BRANCH,
  buildLkReport,
  lkFileName,
  lkGrowth,
  lkMonthLabel,
  lkTotal,
  previousMonth,
  type LkPnlLine,
} from '../../domain/financeLkReportDomain'
import { jakartaMonthKey } from '../../domain/financePeriodReportDomain'
import { buildFinanceLkXlsx } from '../../lib/financeLkXlsxExport'
import { downloadFinancePeriodXlsx } from '../../lib/financePeriodXlsxExport'
import { useBilingualCopy } from '../../i18n/bilingualCopy'
import { toast } from '../../hooks/use-toast'
import { cn } from '../../lib/utils'

const SUMMARY_KEYS = ['net_revenue', 'hpp_total', 'gross_profit', 'expense_total', 'operating_profit', 'net_profit']
const formatIdr = (value: number): string => `${value < 0 ? '-' : ''}Rp ${Math.abs(Math.round(value)).toLocaleString('id-ID')}`
const formatGrowth = (value: number | null): string => value === null ? '–' : `${value >= 0 ? '+' : ''}${(value * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`

/** Last 12 months, newest first, as YYYY-MM in WIB. */
const recentMonths = (): string[] => {
  const months: string[] = []
  let month = jakartaMonthKey(new Date().toISOString())
  for (let index = 0; index < 12; index += 1) {
    months.push(month)
    month = previousMonth(month)
  }
  return months
}

export const FinanceLkReportPanel: FC<{ showHeading?: boolean }> = ({ showHeading = false }) => {
  const tr = useBilingualCopy()
  const orders = useOrdersStore((state) => state.orders)
  const products = useCatalogStore((state) => state.products)
  const branchSettings = useSettingsStore((state) => state.branches)
  const bankAccounts = useSettingsStore((state) => state.paymentMethods.bankAccounts)
  const months = useMemo(recentMonths, [])
  const [month, setMonth] = useState(months[1] ?? months[0])
  const [ledger, setLedger] = useState<FinanceReportLedger | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setLedger(await fetchFinanceReportLedger())
    } catch (reason) {
      console.warn('[finance-report] ledger load failed', reason)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const branches = useMemo(() => {
    const ids = branchSettings.map((branch) => branch.id)
    const known = Object.keys(LK_BRAND_BY_BRANCH).filter((id) => ids.length === 0 || ids.includes(id))
    return [...known, ...ids.filter((id) => !known.includes(id))]
  }, [branchSettings])

  const accountLabel = useCallback((accountId?: string): string => {
    if (!accountId) return ''
    if (accountId === 'cash:main') return 'Kas tunai'
    const account = bankAccounts.find((item) => item.id === accountId)
    return account ? `${account.bankName} · ${account.accountNumber}` : accountId
  }, [bankAccounts])

  const report = useMemo(() => {
    if (!ledger) return null
    return buildLkReport({
      month,
      branches,
      orders,
      transactions: ledger.transactions,
      productTypes: Object.fromEntries(products.map((product) => [product.id, product.productType ?? ''])),
      categoryLabel: (category) => getFinanceCategoryLabel(category as FinanceCategory, ledger.customCategories, ledger.categoryOverrides),
      accountLabel,
    })
  }, [accountLabel, branches, ledger, month, orders, products])

  const download = () => {
    if (!report) return
    try {
      downloadFinancePeriodXlsx(lkFileName(report.month), buildFinanceLkXlsx(report, accountLabel))
    } catch (reason) {
      toast({ title: tr('Report was not downloaded', 'Laporan gagal diunduh'), description: reason instanceof Error ? reason.message : String(reason), variant: 'destructive' })
    }
  }

  const summary = report ? SUMMARY_KEYS.map((key) => report.pnl.find((line) => line.key === key)).filter((line): line is LkPnlLine => Boolean(line)) : []
  const salesCount = report ? report.branches.reduce((sum, branch) => sum + (report.sales[branch]?.product.length ?? 0) + (report.sales[branch]?.cake.length ?? 0), 0) : 0
  const expenseCount = report ? report.branches.reduce((sum, branch) => sum + (report.expenses[branch]?.length ?? 0), 0) : 0

  return (
    <section className="space-y-4" data-testid="finance-lk-report">
      {showHeading && (
        <header className="space-y-1">
          <h2 className="font-display text-xl font-semibold">{tr('Financial report', 'Laporan Keuangan')}</h2>
          <p className="text-sm text-muted-foreground">{tr('Monthly report in the LK format, ready to download as Excel.', 'Laporan bulanan format LK, siap diunduh sebagai Excel.')}</p>
        </header>
      )}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-card p-4 shadow-ios-sm ring-1 ring-border/60">
        <label className="min-w-[180px] flex-1 space-y-1.5 text-xs font-medium">
          {tr('Month', 'Bulan')}
          <select aria-label={tr('Report month', 'Bulan laporan')} value={month} onChange={(event) => setMonth(event.target.value)} className="h-11 w-full rounded-full border border-border bg-background px-4 text-sm">
            {months.map((item) => <option key={item} value={item}>{lkMonthLabel(item)}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label={tr('Refresh report data', 'Muat ulang data laporan')} className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium disabled:opacity-50">
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden="true" /> {tr('Refresh', 'Muat ulang')}
        </button>
        <button type="button" onClick={download} disabled={!report} className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Download className="size-4" aria-hidden="true" /> {tr('Download Excel', 'Unduh Excel')}
        </button>
      </div>

      {loading && !report && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> {tr('Loading report…', 'Memuat laporan…')}</p>
      )}
      {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{tr('The report could not be loaded. Check the connection and press Refresh.', 'Laporan tidak bisa dimuat. Periksa koneksi lalu tekan Muat ulang.')}</p>}

      {report && (
        <div className="space-y-3 rounded-2xl bg-card p-4 shadow-ios-sm ring-1 ring-border/60">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">{tr(`Profit & loss · ${lkMonthLabel(report.month)}`, `Laba rugi · ${lkMonthLabel(report.month)}`)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" aria-label={tr('Profit and loss summary', 'Ringkasan laba rugi')}>
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{tr('Line', 'Akun')}</th>
                  {report.branches.map((branch) => <th key={branch} className="py-2 pr-3 text-right font-medium">{LK_BRAND_BY_BRANCH[branch] ?? branch}</th>)}
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 pr-3 text-right font-medium">{lkMonthLabel(report.previousMonth)}</th>
                  <th className="py-2 text-right font-medium">Growth</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((line) => {
                  const total = lkTotal(line.current, report.branches)
                  const previous = lkTotal(line.previous, report.branches)
                  return (
                    <tr key={line.key} className={cn('border-t border-border/60', line.kind === 'total' && 'font-semibold')}>
                      <td className="py-2 pr-3">{line.label}</td>
                      {report.branches.map((branch) => <td key={branch} className="py-2 pr-3 text-right tabular-nums">{formatIdr(line.current[branch] ?? 0)}</td>)}
                      <td className="py-2 pr-3 text-right tabular-nums">{formatIdr(total)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{formatIdr(previous)}</td>
                      <td className="py-2 text-right tabular-nums">{formatGrowth(lkGrowth(total, previous))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr(
              `${salesCount} orders, ${expenseCount} expenses and ${report.corrections.length} corrections in this month. The Excel file contains PNL, SR, EXP, cash per account and notes.`,
              `${salesCount} pesanan, ${expenseCount} pengeluaran, dan ${report.corrections.length} koreksi di bulan ini. File Excel berisi PNL, SR, EXP, kas per rekening, dan catatan.`,
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {tr(
              'Not recorded in the OS yet (stays 0, marked *): packing, Money Bouquet, installation sales and the detailed HPP/expense accounts.',
              'Belum dicatat di OS (tetap 0, bertanda *): packing, Money Bouquet, penjualan instalasi, dan rincian akun HPP/beban.',
            )}
          </p>
        </div>
      )}
    </section>
  )
}
