import type { OrderTableRow } from '../types/orders'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'

export interface ProcessPaymentResult {
  orderId: string
  orderNumber: string
  revision: number
  paymentStatus: 'paid'
  paidAmountIdr: number
  financeAccountId: string
  paymentVerifiedAt: string
  ledgerTransactionId?: string
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

export const confirmOrderPaymentForProcessing = async (
  order: OrderTableRow,
  financeAccountId: string,
): Promise<ProcessPaymentResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  const result = await getClient().rpc<ProcessPaymentResult>('confirm_order_payment_for_processing', {
    p_order_id: order.id,
    p_expected_revision: order.revision ?? 1,
    p_finance_account_id: financeAccountId,
  })
  const refreshed = await refreshBusinessOsOrdersFromRemote()
  if (!refreshed) throw new Error('Payment was saved, but the latest order could not be reloaded.')
  return result
}
