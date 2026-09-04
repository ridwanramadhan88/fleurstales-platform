import type { OrderTableRow } from '../types/orders'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'
import { useOrdersStore } from '../store/ordersStore'
import { useFinanceStore } from '../store/financeStore'
import { useUserStore } from '../store/userStore'
import { isSharedBackendConfigured } from '../api/remoteSession'

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

const confirmLocalPaymentForProcessing = (
  order: OrderTableRow,
  financeAccountId: string,
): ProcessPaymentResult => {
  const current = useOrdersStore.getState().orders.find((item) => item.orderNumber === order.orderNumber) ?? order
  const user = useUserStore.getState()
  const actor = {
    employeeId: user.employeeId,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
  }
  const result = useOrdersStore.getState().updatePayment({
    orderNumber: current.orderNumber,
    expectedRevision: current.revision ?? 1,
    paymentStatus: 'paid',
    paidAmountIdr: current.totalIdr,
    totalIdr: current.totalIdr,
    paymentMethod: current.paymentMethod,
    note: 'Full payment confirmed before Processing.',
    idempotencyKey: `process-payment:${current.id ?? current.orderNumber}:${current.revision ?? 1}`,
    actor,
  })
  if (!result.allowed) throw new Error(result.reason)

  const paymentEvent = [...(result.order.paymentHistory ?? [])]
    .reverse()
    .find((event) => event.type === 'payment_received' && event.ledgerTransactionId)
  if (paymentEvent?.ledgerTransactionId) {
    useFinanceStore.setState((state) => ({
      transactions: state.transactions.map((transaction) =>
        transaction.id === paymentEvent.ledgerTransactionId
          ? {
              ...transaction,
              accountId: financeAccountId,
              status: 'verified' as const,
              transactionDate: paymentEvent.occurredAt,
              updatedAt: new Date().toISOString(),
            }
          : transaction,
      ),
    }))
  }

  return {
    orderId: result.order.id ?? current.id ?? current.orderNumber,
    orderNumber: result.order.orderNumber,
    revision: result.order.revision ?? (current.revision ?? 1) + 1,
    paymentStatus: 'paid',
    paidAmountIdr: result.order.paidAmountIdr ?? result.order.totalIdr,
    financeAccountId,
    paymentVerifiedAt: paymentEvent?.occurredAt ?? new Date().toISOString(),
    ledgerTransactionId: paymentEvent?.ledgerTransactionId,
  }
}

export const confirmOrderPaymentForProcessing = async (
  order: OrderTableRow,
  financeAccountId: string,
): Promise<ProcessPaymentResult> => {
  if (!order.id) throw new Error('Order id is missing.')
  if (!financeAccountId) throw new Error('Receiving account is required.')

  if (!isSharedBackendConfigured()) {
    return confirmLocalPaymentForProcessing(order, financeAccountId)
  }

  const result = await getClient().rpc<ProcessPaymentResult>('confirm_order_payment_for_processing', {
    p_order_id: order.id,
    p_expected_revision: order.revision ?? 1,
    p_finance_account_id: financeAccountId,
  })
  const refreshed = await refreshBusinessOsOrdersFromRemote()
  if (!refreshed) throw new Error('Payment was saved, but the latest order could not be reloaded.')
  return result
}
