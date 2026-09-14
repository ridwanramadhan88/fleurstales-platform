import type { OrderTableRow } from '../types/orders'
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
  refundAmountIdr: number
  refundCompletedAt: string
  financeAccountId: string
  transferFeeIdr: number
  ledgerTransactionId?: string | null
  feeTransactionId?: string | null
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

export const completeOrderRefundWithAccount = async (
  order: OrderTableRow,
  financeAccountId: string,
  transferFeeAmount = 0,
): Promise<CompleteOrderRefundResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  if (!financeAccountId.trim()) throw new Error('Select the account paying this refund.')
  if (transferFeeAmount < 0) throw new Error('Transfer fee cannot be negative.')

  const result = await getClient().rpc<CompleteOrderRefundResult>(
    'complete_order_refund_with_account',
    {
      p_order_id: order.id,
      p_expected_revision: order.revision ?? 1,
      p_finance_account_id: financeAccountId,
      p_transfer_fee_amount: Math.round(transferFeeAmount),
    },
  )

  await Promise.all([
    refreshBusinessOsOrdersFromRemote().catch(() => false),
    reloadConflictedDomain('finance').catch(() => false),
  ])
  return result
}
