import { getSupabaseAuthClient } from '../api/supabaseAuth'
import type { OperationsOverview, OrderIssueKind } from '../domain/orderIssueDomain'

const requireClient = () => {
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase is not configured.')
  return client
}

export const reportOrderIssue = async (orderId: string, kind: OrderIssueKind, note: string): Promise<void> => {
  const { error } = await requireClient().rpc('report_order_issue', { p_order_id: orderId, p_kind: kind, p_note: note.trim() })
  if (error) throw new Error(error.message)
}

export const resolveOrderIssue = async (issueId: string, resolutionNote: string): Promise<void> => {
  const { error } = await requireClient().rpc('resolve_order_issue', { p_issue_id: issueId, p_resolution_note: resolutionNote.trim() || null })
  if (error) throw new Error(error.message)
}

/** Late orders and issues for a date range (Manager and Owner). */
export const fetchOperationsOverview = async (from: string, to: string): Promise<OperationsOverview> => {
  const { data, error } = await requireClient().rpc('get_operations_overview', { p_from: from, p_to: to })
  if (error) throw new Error(error.message)
  const raw = (data ?? {}) as Partial<OperationsOverview>
  return {
    from: raw.from ?? from,
    to: raw.to ?? to,
    lateOrders: Array.isArray(raw.lateOrders) ? raw.lateOrders : [],
    issues: Array.isArray(raw.issues) ? raw.issues : [],
  }
}
