import type { OrderTableRow } from '../types/orders'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { refreshBusinessOsOrdersFromRemote } from './shared/orderBridge'
import { hydrateOperationalStateFromSupabase } from './operationalSupabaseSync'

export type OrderFinanceReconciliationDecision = 'verify' | 'reject'

export interface OrderFinanceReconciliationResult {
  orderId: string
  orderNumber: string
  revision: number
  financeVerified: boolean
  financeVerificationStatus?: 'rejected' | 'review' | null
  financeVerifiedBy?: string | null
  financeVerifiedAt?: string | null
  updatedAt: string
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

export const decideOrderFinanceReconciliation = async (
  order: OrderTableRow,
  decision: OrderFinanceReconciliationDecision,
  note?: string,
  options: { refresh?: boolean } = {},
): Promise<OrderFinanceReconciliationResult> => {
  if (!order.id) throw new Error('Order id is missing.')

  const result = await getClient().rpc<OrderFinanceReconciliationResult>(
    'decide_order_finance_reconciliation',
    {
      p_order_id: order.id,
      p_expected_revision: order.revision ?? 1,
      p_decision: decision,
      p_note: note?.trim() || null,
    },
  )

  // The RPC atomically updates the order and Finance ledger. Refresh both
  // projections so the queue, balance cards, and revenue reflect the final
  // Finance decision immediately.
  if (options.refresh !== false) await refreshReconciliationProjections()

  return result
}

const refreshReconciliationProjections = async (): Promise<void> => {
  await Promise.all([
    refreshBusinessOsOrdersFromRemote().catch(() => false),
    hydrateOperationalStateFromSupabase().catch(() => false),
  ])
}

export interface BulkReconciliationOutcome {
  reconciled: string[]
  failed: Array<{ orderNumber: string; reason: string }>
}

/**
 * Marks several Admin-confirmed payments as reconciled, one RPC per order
 * (each keeps its own revision check), then refreshes the projections once.
 * One failure does not stop the rest; every failure is reported back.
 */
export const reconcileOrderPayments = async (orders: OrderTableRow[]): Promise<BulkReconciliationOutcome> => {
  const outcome: BulkReconciliationOutcome = { reconciled: [], failed: [] }
  for (const order of orders) {
    try {
      await decideOrderFinanceReconciliation(order, 'verify', undefined, { refresh: false })
      outcome.reconciled.push(order.orderNumber)
    } catch (error) {
      outcome.failed.push({ orderNumber: order.orderNumber, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  if (outcome.reconciled.length > 0) await refreshReconciliationProjections()
  return outcome
}
