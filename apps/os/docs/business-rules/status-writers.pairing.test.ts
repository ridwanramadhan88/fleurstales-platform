import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath: string): string =>
  readFileSync(`${root}/${relativePath}`, 'utf8')

/**
 * This is intentionally a source-to-doc pairing test, not a business-rule
 * behavior test. The behavior tests live beside each store/domain. Its job is
 * to make a renamed or moved writer fail loudly until status-writers.md is
 * reviewed, so the backend map cannot silently drift.
 */
const WRITERS = [
  ['src/store/ordersStore.ts', 'createOrder:', 'createOrder'],
  ['src/store/ordersStore.ts', 'updateOrderStatus:', 'updateOrderStatus'],
  ['src/domain/orderStatusTransitionDomain.ts', 'export const transitionOrderStatus', 'transitionOrderStatus'],
  ['src/store/ordersStoreChangeRequestActions.ts', "source: 'change_request_approval'", 'approveChangeRequest'],
  ['src/store/ordersStore.ts', 'updatePayment:', 'updatePayment'],
  ['src/store/ordersStore.ts', 'initiateRefund:', 'initiateRefund'],
  ['src/store/ordersStore.ts', 'completeRefund:', 'completeRefund'],
  ['src/store/ordersStoreFinanceActions.ts', 'verifyOrderFinance:', 'verifyOrderFinance'],
  ['src/store/ordersStoreFinanceActions.ts', 'rejectOrderFinance:', 'rejectOrderFinance'],
  ['src/store/ordersStoreFinanceActions.ts', 'markOrderForFinanceReview:', 'markOrderForFinanceReview'],
  ['src/store/ordersStoreFinanceActions.ts', 'finalizeUnlockedEdit:', 'finalizeUnlockedEdit'],
  ['src/store/financeStore.ts', 'addTransaction:', 'addTransaction'],
  ['src/store/financeStore.ts', 'verifyTransaction:', 'verifyTransaction'],
  ['src/store/financeStore.ts', 'rejectTransaction:', 'rejectTransaction'],
  ['src/store/stockStoreTransferActions.ts', 'requestTransfer:', 'requestTransfer'],
  ['src/store/stockStoreTransferActions.ts', 'updateTransferStatus:', 'updateTransferStatus'],
  ['src/store/catalogStoreProductActions.ts', 'addProduct:', 'addProduct'],
  ['src/store/catalogStoreProductActions.ts', 'updateProduct:', 'updateProduct'],
  ['src/store/catalogStoreCsvActions.ts', 'importCsv:', 'importCsv'],
  ['src/store/hrStore.ts', 'addEmployee:', 'addEmployee'],
  ['src/store/hrStore.ts', 'activateEmployee:', 'activateEmployee'],
  ['src/store/hrStore.ts', 'deactivateEmployee:', 'deactivateEmployee'],
  ['src/store/catalogStoreProductActions.ts', 'setCatalogVariantStatus:', 'setCatalogVariantStatus'],
  ['src/store/hrStore.ts', 'recordAttendance:', 'recordAttendance'],
] as const

describe('status writer map pairing', () => {
  const map = read('docs/business-rules/status-writers.md')

  it.each(WRITERS)(
    'keeps %s :: %s paired with the documentation',
    (sourceFile, sourceNeedle, documentedName) => {
      expect(read(sourceFile)).toContain(sourceNeedle)
      expect(map).toContain(`\`${documentedName}\``)
    },
  )

  it('documents that both cancellation entry points share one domain command', () => {
    expect(map).toContain('Every runtime lifecycle mutation now converges on `transitionOrderStatus`')
    expect(map).toContain("`transitionOrderStatus({ source: 'change_request_approval' })`")
    expect(map).toContain('no direct `status` assignment remains')
  })

  it('documents derived StockItemStatus as having no persisted writer', () => {
    expect(map).toContain('`StockItemStatus` is derived')
    expect(map).toContain('It has no persisted writer')
  })

  it('indexes demo seed assignments without treating them as mutation commands', () => {
    expect(read('src/store/ordersStoreSeedData.ts')).toContain('export const INITIAL_ORDERS')
    expect(read('src/store/financeStore.ts')).toContain('const INITIAL_TRANSACTIONS')
    expect(read('src/store/catalogStoreSeedData.ts')).toContain('export const SEED_PRODUCTS')
    expect(read('src/store/hrStore.ts')).toContain('const INITIAL_EMPLOYEES')
    expect(map).toContain('Demo-seed assignments (initial state, not mutation commands)')
  })
})
