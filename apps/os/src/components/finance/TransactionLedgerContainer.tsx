import type { FC } from 'react'
import {
  TransactionLedger,
  type TransactionLedgerProps,
} from './TransactionLedger'
import { useTransactionLedgerController } from './TransactionLedgerController'
import { FinanceCashFlowOverview } from './FinanceCashFlowOverview'

export const TransactionLedgerContainer: FC<TransactionLedgerProps> = (props) => {
  const viewModel = useTransactionLedgerController(props)
  return (
    <div className="space-y-8">
      <FinanceCashFlowOverview />
      <TransactionLedger {...viewModel} />
    </div>
  )
}
