import { afterEach, describe, expect, it, vi } from 'vitest'

// Server double: revision 2 holds overtime only; the reload is answered late.
let releaseReload: (() => void) | undefined
const serverState = { revision: 2, snapshot: { employeePayrolls: [{ id: 'p1', hrAdjustments: [{ kind: 'overtime' }] }] } }
const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
  if (name === 'get_operational_domain_state') {
    const answer = structuredClone(serverState)
    await new Promise<void>((resolve) => { releaseReload = resolve })
    return { domain: 'payroll', ...answer, updatedAt: null }
  }
  serverState.revision = Number(args.p_expected_revision) + 1
  serverState.snapshot = args.p_snapshot as typeof serverState.snapshot
  return { domain: 'payroll', revision: serverState.revision, snapshot: args.p_snapshot, updatedAt: null }
})

vi.mock('./shared/bootstrap', () => ({ bootstrapSharedData: () => ({ enabled: true, repositories: { client: { rpc } } }) }))
vi.mock('./shared/supabaseSession', () => ({ getSupabaseBrowserSession: () => ({ access_token: 't' }), browserSupabaseTokenProvider: {} }))
vi.mock('../hooks/use-toast', () => ({ toast: vi.fn() }))

const { usePayrollStore } = await import('../store/payrollStore')
const { publishPayrollWorkflowMutation } = await import('./payrollWorkflowEvents')
const sync = await import('./payrollSupabaseSync')

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const lines = () => (usePayrollStore.getState().employeePayrolls[0] as unknown as { hrAdjustments: { kind: string }[] }).hrAdjustments.map((line) => line.kind)

afterEach(() => sync.stopPayrollSupabaseSync())

describe('payroll reload racing a local edit', () => {
  it('keeps an edit made while a background reload was in flight', async () => {
    // Initial hydrate (revision 2).
    const first = sync.hydratePayrollFromSupabase(); await flush(); releaseReload?.(); await first
    sync.startPayrollSupabaseSync()

    // A realtime reload starts, then HR adds a fee line before it answers.
    const reload = sync.hydratePayrollFromSupabase()
    await flush()
    usePayrollStore.setState({ employeePayrolls: [{ id: 'p1', hrAdjustments: [{ kind: 'overtime' }, { kind: 'fee' }] }] } as never)
    publishPayrollWorkflowMutation('prepare')
    await flush()

    // The reload now answers with revision 2 (no fee).
    releaseReload?.(); await reload; await flush()

    expect(lines()).toEqual(['overtime', 'fee'])
    expect(serverState.revision).toBe(3)
  })
})
