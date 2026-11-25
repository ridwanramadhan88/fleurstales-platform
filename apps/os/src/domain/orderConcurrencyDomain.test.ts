import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import {
  allocateUniqueOrderNumber,
  checkExpectedOrderRevision,
  currentDailyOrderSequence,
  formatDailyOrderNumber,
  jakartaOrderDatePart,
  normalizeOrderConcurrencyMetadata,
  stampOrderRevision,
} from './orderConcurrencyDomain'

describe('order concurrency metadata', () => {
  it('normalizes legacy rows with stable identity and revision 1', () => {
    const normalized = normalizeOrderConcurrencyMetadata(
      makeOrder({ orderNumber: 'KDM-2026-0001' }),
      '2026-07-12T00:00:00.000Z',
    )
    expect(normalized).toMatchObject({
      id: 'legacy-order-kdm-2026-0001',
      revision: 1,
      updatedAt: '2026-07-12T00:00:00.000Z',
    })
  })

  it('increments revision exactly once per committed mutation', () => {
    const current = normalizeOrderConcurrencyMetadata(makeOrder({ orderNumber: 'A' }))
    const next = stampOrderRevision(current, '2026-07-12T01:00:00.000Z')
    expect(next.revision).toBe(2)
    expect(checkExpectedOrderRevision(next, 1)).toMatchObject({
      allowed: false,
      code: 'REVISION_CONFLICT',
      currentRevision: 2,
    })
  })

  it('skips already-used order numbers instead of overwriting a collision', () => {
    expect(
      allocateUniqueOrderNumber({
        prefix: 'KDM',
        datePart: '26-11-26',
        currentSequence: 1,
        existingOrderNumbers: ['KDM-26-11-26-002', 'KDM-26-11-26-003'],
      }),
    ).toEqual({ orderNumber: 'KDM-26-11-26-004', sequence: 4 })
  })

  it('formats daily order numbers per branch and Jakarta day', () => {
    // 23:59 and 00:00 WIB fall on different days.
    expect(jakartaOrderDatePart('2026-11-25T16:59:00.000Z')).toBe('26-11-25')
    expect(jakartaOrderDatePart('2026-11-25T17:00:00.000Z')).toBe('26-11-26')
    expect(formatDailyOrderNumber('PHM', '26-11-26', 10)).toBe('PHM-26-11-26-010')
    expect(formatDailyOrderNumber('PHM', '26-11-26', 1000)).toBe('PHM-26-11-26-1000')
    expect(
      currentDailyOrderSequence('KDM', '26-11-26', ['KDM-26-11-26-007', 'KDM-26-11-25-099', 'PHM-26-11-26-120', 'KDM-2026-0042']),
    ).toBe(7)
  })
})
