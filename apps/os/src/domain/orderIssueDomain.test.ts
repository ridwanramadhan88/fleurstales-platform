import { describe, expect, it } from 'vitest'
import { canReportOrderIssue, formatLateness, groupLateOrdersBy, isValidIssueNote, summarizeLateOrders, type LateOrder } from './orderIssueDomain'

const late = (patch: Partial<LateOrder>): LateOrder => ({
  orderId: 'o', orderNumber: 'N', branchId: 'b', branchName: 'B', fulfillment: 'pickup', status: 'picked_up',
  dueAt: '2026-11-10T03:00:00Z', handedAt: null, minutesLate: 30, ongoing: false, floristName: null, courierName: null, openIssues: 0, ...patch,
})

describe('order issue domain', () => {
  it('formats lateness in both languages', () => {
    expect(formatLateness(45, 'en')).toBe('45 min')
    expect(formatLateness(125, 'en')).toBe('2 h 5 min')
    expect(formatLateness(120, 'id')).toBe('2 j')
    expect(formatLateness(-5, 'id')).toBe('0 mnt')
  })

  it('summarizes late orders', () => {
    expect(summarizeLateOrders([])).toEqual({ total: 0, ongoing: 0, averageMinutes: 0, worstMinutes: 0 })
    expect(summarizeLateOrders([late({ minutesLate: 30 }), late({ minutesLate: 90, ongoing: true })]))
      .toEqual({ total: 2, ongoing: 1, averageMinutes: 60, worstMinutes: 90 })
  })

  it('groups by florist, most late orders first, skipping unnamed', () => {
    const groups = groupLateOrdersBy([
      late({ floristName: 'Sari', minutesLate: 20 }), late({ floristName: 'Sari', minutesLate: 40 }),
      late({ floristName: 'Dewi', minutesLate: 90 }), late({ floristName: null }),
    ], 'floristName')
    expect(groups).toEqual([{ name: 'Sari', count: 2, averageMinutes: 30 }, { name: 'Dewi', count: 1, averageMinutes: 90 }])
  })

  it('validates notes and reporting roles', () => {
    expect(isValidIssueNote('  ab  ')).toBe(false)
    expect(isValidIssueNote('Mawar habis')).toBe(true)
    expect(isValidIssueNote('x'.repeat(501))).toBe(false)
    expect(['owner', 'admin', 'florist', 'manager'].every(canReportOrderIssue)).toBe(true)
    expect(['finance', 'hr', 'courier', null].some((role) => canReportOrderIssue(role))).toBe(false)
  })
})
