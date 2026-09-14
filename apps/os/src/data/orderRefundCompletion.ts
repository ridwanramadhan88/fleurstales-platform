import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'
import { reloadConflictedDomain } from './operationalSupabaseSync'

export interface CompleteOrderRefundResult {
  orderId: string
  orderNumber: string
  revision: number
  paymentStatus: 'refunded'
  paidAmountIdr: number
  refundCompletedAt: string
  financeAccountId: string
  ledgerTransactionId?: string | null
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

export const completeOrderRefundWithAccount = async (input: {
  orderId: string
  expectedRevision: number
  financeAccountId: string
}): Promise<CompleteOrderRefundResult> => {
  const result = await getClient().rpc<CompleteOrderRefundResult>('complete_order_refund_with_account', {
    p_order_id: input.orderId,
    p_expected_revision: input.expectedRevision,
    p_finance_account_id: input.financeAccountId,
  })

  const [ordersRefreshed, financeRefreshed] = await Promise.all([
    refreshBusinessOsOrdersFromRemote().catch(() => false),
    reloadConflictedDomain('finance').catch(() => false),
  ])
  if (!ordersRefreshed || !financeRefreshed) {
    throw new Error('Refund was completed, but the latest order or Finance ledger could not be reloaded.')
  }

  return result
}
