import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Finance v3 accounting period closing regression', () => {
  it('persists auditable monthly period state and freezes closed ledger history', () => {
    const migration = read('../../supabase/migrations/20260915100000_finance_period_closing.sql')

    expect(migration).toContain('create table if not exists public.finance_periods')
    expect(migration).toContain("status in ('open','review','closed')")
    expect(migration).toContain('create table if not exists public.finance_period_actions')
    expect(migration).toContain("'finance.close_period'")
    expect(migration).toContain("'finance.reopen_period'")
    expect(migration).toContain('private.finance_period_blockers')
    expect(migration).toContain('FINANCE_PERIOD_HAS_BLOCKERS')
    expect(migration).toContain('FINANCE_PERIOD_NOT_ENDED')
    expect(migration).toContain('FINANCE_REOPEN_REASON_REQUIRED')
    expect(migration).toContain('guard_closed_finance_period_transactions')
    expect(migration).toContain('FINANCE_PERIOD_CLOSED')
  })

  it('keeps reopen separate from normal month-close permission', () => {
    const permissions = read('src/config/actionPermissions.ts')

    expect(permissions).toContain("'finance.close_period'")
    expect(permissions).toContain("'finance.reopen_period'")
    expect(permissions).toContain("'finance.edit_ledger_entry','finance.close_period'")
    expect(permissions).not.toContain("'finance.edit_ledger_entry','finance.close_period','finance.reopen_period'")
  })

  it('loads and changes period status through server-owned RPCs', () => {
    const data = read('src/data/financePeriods.ts')

    expect(data).toContain("rpc<FinancePeriodSummary[]>('get_finance_periods'")
    expect(data).toContain("rpc<FinancePeriodSummary>('set_finance_period_status'")
    expect(data).toContain("export type FinancePeriodStatus = 'open' | 'review' | 'closed'")
  })

  it('keeps period closing with the month it closes, on the Reports tab', () => {
    const report = read('src/components/finance/FinanceReportTab.tsx')
    const card = read('src/components/finance/FinancePeriodStatusCard.tsx')

    expect(report).toContain('<FinancePeriodStatusCard')
    expect(report).toContain("periods.find((item) => item.periodMonth.slice(0, 7) === month)")
    expect(card).toContain("tr('Start review', 'Mulai review')")
    expect(card).toContain("tr('Close month', 'Tutup buku')")
    expect(card).toContain("tr('Reopen', 'Buka ulang')")
    // The current month cannot be closed before it ends; blockers disable closing.
    expect(card).toContain('{!isCurrent && (')
    expect(card).toContain('disabled={busy || period.blockerTotal > 0}')
    expect(card).toContain('period.blockers.legacyAccounts')
  })
})
