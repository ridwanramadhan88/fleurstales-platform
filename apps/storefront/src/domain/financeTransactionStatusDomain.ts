/**
 * @file financeTransactionStatusDomain.ts
 * @description Authoritative state/permission gate for internal general-ledger
 * transaction verification decisions.
 */

import type { UserRole } from '../store/userStore'
import type { FinanceTransaction } from '../store/financeStoreTypes'

export type FinanceTransactionDecision = 'verify' | 'reject'

export interface FinanceTransactionDecisionResult {
  allowed: boolean
  reason?: string
}

/**
 * Finance transaction decisions are Finance-only. Owner's finance section access
 * is intentionally read-only; order-level Finance overrides do not grant
 * blanket general-ledger mutation rights.
 */
export const canMakeFinanceTransactionDecision = ({
  transaction,
  role,
  decision,
  capabilityAllowed = true,
}: {
  transaction: FinanceTransaction | undefined
  role: UserRole
  decision: FinanceTransactionDecision
  capabilityAllowed?: boolean
}): FinanceTransactionDecisionResult => {
  if (!transaction) {
    return { allowed: false, reason: 'Transaction not found.' }
  }

  if (!capabilityAllowed) {
    return { allowed: false, reason: 'This account is not permitted to verify transactions.' }
  }

  if (role !== 'finance') {
    return {
      allowed: false,
      reason: 'Only Finance can verify or reject transactions.',
    }
  }

  if (transaction.status !== 'pending') {
    return {
      allowed: false,
      reason: 'Only pending transactions can be verified or rejected.',
    }
  }

  if (decision !== 'verify' && decision !== 'reject') {
    return { allowed: false, reason: 'Unsupported transaction decision.' }
  }

  return { allowed: true }
}
