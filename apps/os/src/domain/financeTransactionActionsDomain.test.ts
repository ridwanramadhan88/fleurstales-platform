import { describe, expect, it } from 'vitest'
import type { FinanceTransaction } from '../store/financeStoreTypes'
import {
  canEditFinanceTransaction,
  canVoidFinanceTransaction,
  financeActionCopy,
  financeTransactionKind,
  fromJakartaDateTimeInput,
  toJakartaDateTimeInput,
} from './financeTransactionActionsDomain'

const tx = (patch: Partial<FinanceTransaction>): FinanceTransaction => ({
  id: 'txn-1', type: 'income', category: 'order_payment', branch: 'Kedamaian', amount: 100000, method: 'transfer',
  status: 'verified', description: '', actor: 'System', createdAt: '2026-11-07T03:00:00.000Z', updatedAt: '2026-11-07T03:00:00.000Z',
  ...patch,
})

describe('finance transaction actions', () => {
  it('lets Finance edit and void every posted row, including automatic order rows', () => {
    const orderPayment = tx({ source: 'order_payment', sourceEventId: 'evt-1', entryMode: 'automatic', isSystemGenerated: true, orderNumber: 'KDM-1' })
    expect(canEditFinanceTransaction(orderPayment, true)).toBe(true)
    expect(canVoidFinanceTransaction(orderPayment, true)).toBe(true)
    expect(canEditFinanceTransaction(orderPayment, false)).toBe(false)
  })

  it('freezes voided rows', () => {
    const voided = tx({ status: 'void', voidReason: 'dobel' })
    expect(canEditFinanceTransaction(voided, true)).toBe(false)
    expect(canVoidFinanceTransaction(voided, true)).toBe(false)
  })

  it('explains what a void does per kind', () => {
    const payment = tx({ source: 'order_payment', sourceEventId: 'evt-1', orderNumber: 'KDM-1' })
    expect(financeTransactionKind(payment)).toBe('order_payment')
    expect(financeActionCopy(payment).voidConsequence.id).toContain('Pesanan KDM-1 akan dibatalkan')
    expect(financeTransactionKind(tx({ source: 'transfer', transferId: 'tr-1' }))).toBe('transfer')
    expect(financeTransactionKind(tx({ source: 'manual' }))).toBe('ledger')
    expect(financeActionCopy(tx({ source: 'manual' })).editWarning).toBeUndefined()
  })

  it('round-trips datetime-local values in WIB', () => {
    expect(toJakartaDateTimeInput('2026-11-07T03:05:00.000Z')).toBe('2026-11-07T10:05')
    expect(fromJakartaDateTimeInput('2026-11-07T10:05')).toBe('2026-11-07T03:05:00.000Z')
    expect(fromJakartaDateTimeInput('')).toBeUndefined()
  })
})
