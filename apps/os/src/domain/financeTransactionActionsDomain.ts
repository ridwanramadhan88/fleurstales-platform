import type { FinanceTransaction } from '../store/financeStoreTypes'

/**
 * Finance may edit or void every posted ledger row — manual entries, payroll,
 * transfers (as a pair) and order payments/refunds, also after the order was
 * reconciled. Voided rows are final. Closed months are enforced by the server.
 */
export type FinanceTransactionKind = 'order_payment' | 'order_refund' | 'transfer' | 'payroll' | 'ledger'

export const financeTransactionKind = (transaction: FinanceTransaction): FinanceTransactionKind => {
  if (transaction.source === 'order_payment' && transaction.sourceEventId) return 'order_payment'
  if (transaction.source === 'order_refund' && transaction.sourceEventId) return 'order_refund'
  if (transaction.source === 'transfer' && transaction.transferId) return 'transfer'
  if (transaction.source === 'payroll') return 'payroll'
  return 'ledger'
}

export const isVoidedFinanceTransaction = (transaction: FinanceTransaction): boolean => transaction.status === 'void'

export const canEditFinanceTransaction = (transaction: FinanceTransaction, isFinance: boolean): boolean =>
  isFinance && transaction.status === 'verified'

export const canVoidFinanceTransaction = (transaction: FinanceTransaction, isFinance: boolean): boolean =>
  isFinance && transaction.status === 'verified'

/** Fields the server accepts for each kind (see finance_edit_transaction_v2). */
export const financeEditableFields = (transaction: FinanceTransaction) => {
  const kind = financeTransactionKind(transaction)
  return {
    account: true,
    amount: true,
    transactionDate: true,
    reference: true,
    note: true,
    /** Order rows carry a cash/transfer method that follows the chosen account. */
    methodFollowsAccount: kind === 'order_payment' || kind === 'order_refund',
  }
}

/** Dialog title for a row: server-generated names are English, so known kinds get both languages. */
export const financeTransactionTitle = (transaction: FinanceTransaction): { en: string; id: string } => {
  const kind = financeTransactionKind(transaction)
  if (kind === 'order_payment') return { en: 'Order payment', id: 'Pembayaran pesanan' }
  if (kind === 'order_refund') return { en: 'Order refund', id: 'Refund pesanan' }
  if (kind === 'transfer') return { en: 'Account transfer', id: 'Transfer antar rekening' }
  if (kind === 'payroll') return { en: 'Payroll payment', id: 'Pembayaran gaji' }
  const name = transaction.name?.trim() || transaction.description?.trim() || transaction.transactionCode || transaction.id
  return { en: name, id: name }
}

export interface FinanceActionCopy {
  editWarning?: { en: string; id: string }
  voidConsequence: { en: string; id: string }
}

export const financeActionCopy = (transaction: FinanceTransaction): FinanceActionCopy => {
  const order = transaction.orderNumber ? ` ${transaction.orderNumber}` : ''
  switch (financeTransactionKind(transaction)) {
    case 'order_payment':
      return {
        editWarning: {
          en: `The paid amount of order${order} follows this amount. The order price does not change; any gap shows as under- or overpayment.`,
          id: `Jumlah dibayar pesanan${order} ikut berubah. Harga pesanan tetap; selisihnya tampil sebagai kurang/lebih bayar.`,
        },
        voidConsequence: {
          en: `Order${order} will be cancelled. Other payments still held for it go to the refund queue, and a review reward used on it is returned to the customer.`,
          id: `Pesanan${order} akan dibatalkan. Pembayaran lain yang masih tersimpan untuk pesanan ini masuk antrean refund, dan hadiah ulasan yang terpakai dikembalikan ke pelanggan.`,
        },
      }
    case 'order_refund':
      return {
        editWarning: {
          en: `The refunded amount of order${order} follows this amount.`,
          id: `Jumlah refund pesanan${order} ikut berubah.`,
        },
        voidConsequence: {
          en: `The refund is treated as not paid out: order${order} returns to the refund queue.`,
          id: `Refund dianggap belum dibayarkan: pesanan${order} kembali ke antrean refund.`,
        },
      }
    case 'transfer':
      return {
        editWarning: {
          en: 'Both sides of this transfer change together (amount, date, reference).',
          id: 'Kedua sisi transfer ini ikut berubah (nominal, tanggal, referensi).',
        },
        voidConsequence: {
          en: 'Both sides of this transfer are voided together.',
          id: 'Kedua sisi transfer ini di-void bersamaan.',
        },
      }
    case 'payroll':
      return {
        editWarning: {
          en: 'Only the Finance ledger changes; the payroll record keeps its status.',
          id: 'Hanya catatan Keuangan yang berubah; status di Payroll tetap.',
        },
        voidConsequence: {
          en: 'Only the Finance ledger row is voided; the payroll record keeps its paid status.',
          id: 'Hanya baris Keuangan yang di-void; status di Payroll tetap dibayar.',
        },
      }
    default:
      return {
        voidConsequence: {
          en: 'The transaction stays visible (struck through) but no longer counts in balances or reports.',
          id: 'Transaksi tetap terlihat (dicoret) tetapi tidak lagi dihitung di saldo maupun laporan.',
        },
      }
  }
}

/** `YYYY-MM-DDTHH:mm` in Asia/Jakarta for a datetime-local input. */
export const toJakartaDateTimeInput = (value: string | undefined): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** Inverse of {@link toJakartaDateTimeInput}: the input is always read as WIB. */
export const fromJakartaDateTimeInput = (value: string): string | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined
  return new Date(`${value}:00+07:00`).toISOString()
}
