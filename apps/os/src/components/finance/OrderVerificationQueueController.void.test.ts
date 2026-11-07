import { describe, expect, it } from 'vitest'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import type { OrderTableRow } from '../../types/orders'
import { paymentRowsForOrders } from './OrderVerificationQueueController'

const order = { orderNumber: 'KDM-2026-0009', status: 'cancelled', paidAmountIdr: 0 } as unknown as OrderTableRow
const payment = (patch: Partial<FinanceTransaction>): FinanceTransaction => ({
  id: 'txn-1', type: 'income', category: 'order_payment', branch: 'Kedamaian', amount: 110000, method: 'cash',
  status: 'verified', description: '', actor: 'System', createdAt: '2026-11-07T03:00:00.000Z', updatedAt: '2026-11-07T03:00:00.000Z',
  source: 'order_payment', orderNumber: 'KDM-2026-0009', ...patch,
})

describe('reconciliation queue and voided payments', () => {
  it('drops an order whose only payment was voided', () => {
    expect(paymentRowsForOrders([order], [payment({ status: 'void', voidReason: 'palsu' })])).toEqual([])
  })

  it('counts only the payments that are still valid', () => {
    const rows = paymentRowsForOrders([order], [
      payment({ id: 'txn-void', status: 'void', amount: 200000 }),
      payment({ id: 'txn-live', amount: 300000, createdAt: '2026-11-07T04:00:00.000Z' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].paymentAmountIdr).toBe(300000)
    expect(rows[0].transactionId).toBe('txn-live')
  })
})
