import { describe, expect, it } from 'vitest'
import { makeOrder } from '../test/factories/order'
import {
  allocateUniqueOrderNumber,
  checkExpectedOrderRevision,
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
        year: 2026,
        currentSequence: 1,
        existingOrderNumbers: ['KDM-2026-0002', 'KDM-2026-0003'],
      }),
    ).toEqual({ orderNumber: 'KDM-2026-0004', sequence: 4 })
  })
})
