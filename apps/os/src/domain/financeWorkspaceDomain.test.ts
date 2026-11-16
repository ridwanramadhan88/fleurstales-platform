import { describe, expect, it } from 'vitest'
import {
  getDefaultFinanceWorkspaceModule,
  getFinanceWorkspaceModules,
  normalizeFinanceRoute,
} from './financeWorkspaceDomain'

// Regression boundary: the Finance workspace is intentionally Finance-only.
describe('finance workspace', () => {
  it('keeps non-Finance roles out of Finance', () => {
    expect(getFinanceWorkspaceModules('owner')).toEqual([])
    expect(getFinanceWorkspaceModules('admin')).toEqual([])
    expect(getFinanceWorkspaceModules('hr')).toEqual([])
    expect(getFinanceWorkspaceModules('florist')).toEqual([])
  })

  it('gives Finance four tabs and lands on Tasks', () => {
    expect(getFinanceWorkspaceModules('finance')).toEqual(['tasks', 'cash', 'payroll', 'report'])
    expect(getDefaultFinanceWorkspaceModule('finance')).toBe('tasks')
  })

  it('maps v2 routes from notifications and old links onto v3 tabs', () => {
    expect(normalizeFinanceRoute('order_verification')).toBe('tasks')
    expect(normalizeFinanceRoute('refunds')).toBe('tasks')
    expect(normalizeFinanceRoute('ledger')).toBe('cash')
    expect(normalizeFinanceRoute('balance')).toBe('cash')
    expect(normalizeFinanceRoute('payroll')).toBe('payroll')
    expect(normalizeFinanceRoute('report')).toBe('report')
  })
})
