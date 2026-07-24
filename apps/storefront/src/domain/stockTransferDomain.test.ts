/**
 * @file stockTransferDomain.test.ts
 * @description Exhaustive state-machine coverage for stock transfers.
 */

import { describe, expect, it } from 'vitest'
import { canTransitionStockTransferStatus } from './stockTransferDomain'
import type { StockTransferStatus } from '../store/stockStoreTypes'

const statuses: StockTransferStatus[] = [
  'requested',
  'in_transit',
  'received',
  'cancelled',
]

const allowedTransitions = new Set([
  'requested->in_transit',
  'requested->cancelled',
  'in_transit->received',
  'in_transit->cancelled',
])

describe('canTransitionStockTransferStatus', () => {
  it.each(
    statuses.flatMap((from) => statuses.map((to) => [from, to] as const)),
  )('returns the expected rule for %s → %s', (from, to) => {
    expect(canTransitionStockTransferStatus(from, to)).toBe(
      allowedTransitions.has(`${from}->${to}`),
    )
  })
})
