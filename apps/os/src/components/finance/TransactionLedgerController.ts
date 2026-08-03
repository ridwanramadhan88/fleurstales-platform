import type { FinanceTransaction } from '../../store/financeStoreTypes'
import type { TransactionLedgerProps } from './TransactionLedger'

export interface TransactionLedgerViewModel {
  transactions: FinanceTransaction[]
  canEditManual: boolean
  isVisible: boolean
  defaultBranch?: import('../../types/orders').BranchFilter
}

export const useTransactionLedgerController = ({
  transactions,
  canEditManual,
  defaultBranch,
}: TransactionLedgerProps): TransactionLedgerViewModel => ({
  transactions,
  canEditManual,
  defaultBranch,
  isVisible: transactions.length > 0 || canEditManual,
})
