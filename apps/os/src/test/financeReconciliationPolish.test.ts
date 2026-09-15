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

  it('keeps reconciliation review-only while surfacing order and ledger links', () => {
    const queue = read('src/components/finance/OrderVerificationQueue.tsx')
    const row = read('src/components/finance/OrderVerificationQueueRow.tsx')
    const filters = read('src/components/finance/FinanceOrderFilterBar.tsx')
    const controller = read('src/components/finance/OrderVerificationQueueController.ts')

    expect(queue).toContain('it never posts the money a second time')
    expect(queue).toContain('FinanceTransactionDetailSheet')
    expect(row).toContain('Open order')
    expect(row).toContain('Ledger entry')
    expect(row).toContain('Transaction code')
    expect(row).toContain('Reference')
    expect(filters).toContain('Accounting month')
    expect(filters).toContain('Awaiting review')
    expect(filters).toContain('Needs correction')
    expect(filters).toContain('Reconciled')
    expect(controller).toContain('sortFinanceReconciliationRows')
    expect(controller).toContain("row.reconciliationStatus === statusFilter")
  })
})
