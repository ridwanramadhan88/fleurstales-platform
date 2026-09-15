import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'

export type FinancePeriodStatus = 'open' | 'review' | 'closed'
export type FinancePeriodActionType = 'start_review' | 'return_open' | 'close' | 'reopen'

export interface FinancePeriodBlockers {
  reconciliation: number
  refunds: number
  payroll: number
  legacyAccounts: number
  pendingTransactions: number
}

export interface FinancePeriodSummary {
  periodMonth: string
  status: FinancePeriodStatus
  revision: number
  blockers: FinancePeriodBlockers
  blockerTotal: number
  closedAt?: string
  closedBy?: string
  closedReason?: string
  reopenedAt?: string
  reopenedBy?: string
  reopenReason?: string
  updatedAt?: string
}

export interface FinancePeriodAction {
  id: string
  periodMonth: string
  action: FinancePeriodActionType
  fromStatus: FinancePeriodStatus
  toStatus: FinancePeriodStatus
  actorEmployeeId?: string
  actorName: string
  actorRole: string
  reason?: string
  createdAt: string
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

export const getFinancePeriods = async (monthsBack = 6): Promise<FinancePeriodSummary[]> => {
  const response = await getClient().rpc<FinancePeriodSummary[]>('get_finance_periods', {
    p_months_back: Math.max(1, Math.min(Math.round(monthsBack), 24)),
  })
  return Array.isArray(response) ? response : []
}

export const getFinancePeriodActions = async (monthsBack = 6): Promise<FinancePeriodAction[]> => {
  const response = await getClient().rpc<FinancePeriodAction[]>('get_finance_period_actions', {
    p_months_back: Math.max(1, Math.min(Math.round(monthsBack), 24)),
  })
  return Array.isArray(response) ? response : []
}

export const setFinancePeriodStatus = async (input: {
  periodMonth: string
  status: FinancePeriodStatus
  reason?: string
}): Promise<FinancePeriodSummary> =>
  getClient().rpc<FinancePeriodSummary>('set_finance_period_status', {
    p_period_month: input.periodMonth,
    p_status: input.status,
    p_reason: input.reason?.trim() || null,
  })
