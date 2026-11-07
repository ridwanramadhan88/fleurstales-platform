import type { FC } from 'react'
import {
  TransactionLedger,
  type TransactionLedgerProps,
} from './TransactionLedger'
import { useTransactionLedgerController } from './TransactionLedgerController'
import { FinancePostedTransactionEditor } from './FinancePostedTransactionEditor'
import { FinanceVoidTransactionDialog } from './FinanceVoidTransactionDialog'

export const TransactionLedgerContainer: FC<TransactionLedgerProps> = (props) => {
  const viewModel = useTransactionLedgerController(props)
  return (
    <div className="space-y-8">
      <TransactionLedger {...viewModel} />
      <FinancePostedTransactionEditor />
      <FinanceVoidTransactionDialog />
    </div>
  )
}
