import type { FinanceTransaction } from '../../store/financeStoreTypes'
import type { TransactionLedgerProps } from './TransactionLedger'

export interface TransactionLedgerViewModel {
  transactions: FinanceTransaction[]
  canEditManual: boolean
  isVisible: boolean
  defaultBranch?: import('../../types/orders').BranchFilter
}

const isPostedTransaction = (transaction: FinanceTransaction): boolean =>
  transaction.source !== 'order_payment' || transaction.status === 'verified'

export const useTransactionLedgerController = ({
  transactions,
  canEditManual,
  defaultBranch,
}: TransactionLedgerProps): TransactionLedgerViewModel => {
  const postedTransactions = transactions.filter(isPostedTransaction)

  return {
    transactions: postedTransactions,
    canEditManual,
    defaultBranch,
    isVisible: postedTransactions.length > 0 || canEditManual,
  }
}
