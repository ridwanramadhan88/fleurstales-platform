import { useMemo, useState } from 'react'
import { useFinanceStore } from '../../store/financeStore'
import type { FinanceTransaction } from '../../store/financeStoreTypes'
import type { InternalTransactionVerificationQueueProps } from './InternalTransactionVerificationQueue'

export interface InternalTransactionVerificationQueueViewModel {
  canVerify: boolean
  isVisible: boolean
  actionTransactionId: string | null
  actionType: 'reject' | null
  pendingTransactions: FinanceTransaction[]
  verifiedTransactions: FinanceTransaction[]
  rejectedTransactions: FinanceTransaction[]
  onStartReject: (transactionId: string) => void
  onCloseAction: () => void
  onVerify: (transactionId: string) => void
  onConfirmReject: (transactionId: string) => void
  defaultBranch?: import('../../types/orders').BranchFilter
}

export const useInternalTransactionVerificationQueueController = ({
  transactions,
  canVerify,
  actorName,
  actorRole,
  defaultBranch,
}: InternalTransactionVerificationQueueProps): InternalTransactionVerificationQueueViewModel => {
  const verifyTransaction = useFinanceStore((state) => state.verifyTransaction)
  const rejectTransaction = useFinanceStore((state) => state.rejectTransaction)

  const [actionTransactionId, setActionTransactionId] = useState<string | null>(
    null,
  )
  const [actionType, setActionType] = useState<'reject' | null>(null)

  // Transactions is the complete audit ledger. Automatic order payments
  // must remain visible in All and Orders rather than being hidden here.
  const internalTransactions = transactions

  const pendingTransactions = useMemo(
    () =>
      internalTransactions
        .filter((transaction) => transaction.status === 'pending')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [internalTransactions],
  )


  const verifiedTransactions = useMemo(
    () =>
      internalTransactions
        .filter((transaction) => transaction.status === 'verified')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [internalTransactions],
  )

  const rejectedTransactions = useMemo(
    () =>
      internalTransactions.filter(
        (transaction) => transaction.status === 'rejected',
      ),
    [internalTransactions],
  )

  const closeAction = () => {
    setActionTransactionId(null)
    setActionType(null)
  }

  return {
    canVerify,
    defaultBranch,
    isVisible:
      canVerify ||
      pendingTransactions.length > 0 ||
      rejectedTransactions.length > 0,
    actionTransactionId,
    actionType,
    pendingTransactions,
    verifiedTransactions,
    rejectedTransactions,
    onStartReject: (transactionId) => {
      setActionTransactionId(transactionId)
      setActionType('reject')
    },
    onCloseAction: closeAction,
    onVerify: (transactionId) =>
      verifyTransaction({
        transactionId,
        actor: { name: actorName, role: actorRole },
      }),
    onConfirmReject: (transactionId) => {
      rejectTransaction({
        transactionId,
        actor: { name: actorName, role: actorRole },
      })
      closeAction()
    },
  }
}
