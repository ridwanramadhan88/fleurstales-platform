import { describe, expect, it } from 'vitest'
import {
  getDefaultFinanceWorkspaceModule,
  getFinanceWorkspaceModules,
} from './financeWorkspaceDomain'

// Regression boundary: the Finance workspace is intentionally Finance-only.
describe('finance workspace privacy', () => {
  it('keeps non-Finance roles out of Finance', () => {
    expect(getFinanceWorkspaceModules('owner')).toEqual([])
    expect(getFinanceWorkspaceModules('admin')).toEqual([])
    expect(getFinanceWorkspaceModules('hr')).toEqual([])
    expect(getFinanceWorkspaceModules('florist')).toEqual([])
  })

  it('keeps Overview first while preserving the internal reconciliation routes', () => {
    expect(getFinanceWorkspaceModules('finance')).toEqual([
      'balance', 'order_verification', 'refunds', 'ledger', 'payroll',
    ])
  })

  it('opens reconciliation from the "Order Reconciliation" menu item', () => {
    expect(getDefaultFinanceWorkspaceModule('finance')).toBe('order_verification')
  })
})
