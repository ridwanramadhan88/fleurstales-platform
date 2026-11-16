import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  financeReconciliationPriority,
  formatFinanceReconciliationMonth,
  getFinanceReconciliationStatus,
  jakartaMonthKeyFromTimestamp,
} from '../domain/financeReconciliationDomain'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Finance v3.3 reconciliation polish', () => {
  it('separates reconciliation state from order fulfillment state', () => {
    expect(getFinanceReconciliationStatus({ financeVerified: true })).toBe('reconciled')
    expect(getFinanceReconciliationStatus({ financeVerified: false, financeVerificationStatus: 'rejected' })).toBe('needs_correction')
    expect(getFinanceReconciliationStatus({ financeVerified: false })).toBe('awaiting_review')
  })

  it('prioritizes unresolved work before reconciled history', () => {
    expect(financeReconciliationPriority('needs_correction')).toBeLessThan(financeReconciliationPriority('awaiting_review'))
    expect(financeReconciliationPriority('awaiting_review')).toBeLessThan(financeReconciliationPriority('reconciled'))
  })

  it('uses Asia/Jakarta month boundaries for reconciliation filtering', () => {
    expect(jakartaMonthKeyFromTimestamp('2026-08-31T18:00:00Z')).toBe('2026-09')
    expect(formatFinanceReconciliationMonth('2026-09')).toBe('September 2026')
  })

  it('lists open reconciliation work first and keeps Admin corrections apart', () => {
    const tasks = read('src/domain/financeTasksDomain.ts')
    const tab = read('src/components/finance/FinanceTasksTab.tsx')

    expect(tasks).toContain('sortFinanceReconciliationRows(')
    expect(tasks).toContain("row.reconciliationStatus !== 'reconciled'")
    expect(tasks).toContain("row.reconciliationStatus === 'needs_correction'")
    // Tapping a row opens the payment evidence; matching is a separate action.
    expect(tab).toContain('onOpen={() => openOrderReview(orderNumber)}')
    expect(tab).toContain("{tr('Match', 'Cocok')}")
  })
})
