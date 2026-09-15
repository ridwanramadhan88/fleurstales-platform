import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Finance v3.4 accounting period audit and permission polish', () => {
  it('exposes period actions only through an authenticated read-only RPC', () => {
    const migration = read('../../supabase/migrations/20260916001000_finance_period_audit_history.sql')

    expect(migration).toContain('create or replace function public.get_finance_period_actions')
    expect(migration).toContain("private.has_section_access('finance','view')")
    expect(migration).toContain('from public.finance_period_actions action_row')
    expect(migration).toContain("'actorName', action_row.actor_name")
    expect(migration).toContain("'reason', action_row.reason")
    expect(migration).toContain("'createdAt', action_row.created_at")
    expect(migration).toContain('revoke execute on function public.get_finance_period_actions(integer) from public, anon')
    expect(migration).toContain('grant execute on function public.get_finance_period_actions(integer) to authenticated, service_role')
    expect(migration).not.toContain('grant select on table public.finance_period_actions')
  })

  it('loads typed audit events without introducing another write command', () => {
    const data = read('src/data/financePeriods.ts')

    expect(data).toContain("export type FinancePeriodActionType = 'start_review' | 'return_open' | 'close' | 'reopen'")
    expect(data).toContain('export interface FinancePeriodAction')
    expect(data).toContain("rpc<FinancePeriodAction[]>('get_finance_period_actions'")
    expect(data).toContain("rpc<FinancePeriodSummary>('set_finance_period_status'")
  })

  it('renders actor, role, reason and Jakarta time as read-only history', () => {
    const history = read('src/components/finance/FinancePeriodAuditHistory.tsx')
    const controls = read('src/components/finance/FinancePeriodControls.tsx')

    expect(history).toContain('Period audit history')
    expect(history).toContain('Read only')
    expect(history).toContain('entry.actorName')
    expect(history).toContain('entry.actorRole')
    expect(history).toContain('entry.reason')
    expect(history).toContain("timeZone: 'Asia/Jakarta'")
    expect(history).toContain('WIB')
    expect(controls).toContain('<FinancePeriodAuditHistory />')
  })

  it('makes reopen risk and separate authorization explicit', () => {
    const controls = read('src/components/finance/FinancePeriodControls.tsx')
    const permissions = read('src/config/actionPermissions.ts')

    expect(controls).toContain("isActionAuthorized(role, 'finance.reopen_period')")
    expect(controls).toContain('Owner can grant this sensitive Finance capability from Permissions.')
    expect(controls).toContain('Reopening makes this month’s Finance ledger editable again')
    expect(controls).toContain('Later edits can change balances and reports for this period.')
    expect(controls).toContain('The reopen actor, time, and reason stay in read-only audit history.')
    expect(permissions).toContain("{ id:'finance.reopen_period', label:'Reopen Accounting Period'")
    expect(permissions).not.toContain("'finance.edit_ledger_entry','finance.close_period','finance.reopen_period'")
  })
})
