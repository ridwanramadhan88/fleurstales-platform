import { describe, expect, it } from 'vitest'
import {
  getFinanceWorkspaceModules,
} from './financeWorkspaceDomain'

describe('finance workspace privacy', () => {
  it('keeps non-Finance roles out of Finance', () => {
    expect(getFinanceWorkspaceModules('owner')).toEqual([])
    expect(getFinanceWorkspaceModules('admin')).toEqual([])
    expect(getFinanceWorkspaceModules('hr')).toEqual([])
    expect(getFinanceWorkspaceModules('florist')).toEqual([])
  })

  it('allows Finance to view all finance modules', () => {
    expect(getFinanceWorkspaceModules('finance')).toEqual([
      'order_verification', 'ledger', 'payroll', 'refunds',
    ])
  })
})