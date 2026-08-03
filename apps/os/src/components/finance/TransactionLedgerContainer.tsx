import type { FC } from 'react'
import {
  TransactionLedger,
  type TransactionLedgerProps,
} from './TransactionLedger'
import { useTransactionLedgerController } from './TransactionLedgerController'

export const TransactionLedgerContainer: FC<TransactionLedgerProps> = (props) => {
  const viewModel = useTransactionLedgerController(props)
  return <TransactionLedger {...viewModel} />
}
