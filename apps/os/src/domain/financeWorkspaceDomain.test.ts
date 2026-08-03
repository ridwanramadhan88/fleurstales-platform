import { describe, expect, it } from 'vitest'
import {
  getFinanceWorkspaceModules,
} from './financeWorkspaceDomain'

describe('finance workspace privacy', () => {
  it('keeps Admin and Florist out of Finance', () => {
    expect(getFinanceWorkspaceModules('admin')).toEqual([])
    expect(getFinanceWorkspaceModules('florist')).toEqual([])
  })

  it('allows Finance and Owner to view all finance modules', () => {
    expect(getFinanceWorkspaceModules('finance')).toEqual([
      'order_verification', 'ledger', 'payroll', 'refunds',
    ])
    expect(getFinanceWorkspaceModules('owner')).toEqual([
      'order_verification', 'ledger', 'payroll', 'refunds',
    ])
  })
})
