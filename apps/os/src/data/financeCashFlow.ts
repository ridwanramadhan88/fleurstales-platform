import type { Json } from './shared/databaseTypes'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { reloadConflictedDomain } from './operationalSupabaseSync'

interface OperationalDomainResponse {
  domain: 'finance'
  revision: number
  snapshot: Json | null
  updatedAt: string | null
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

const getFinanceRevision = async (): Promise<number> => {
  const response = await getClient().rpc<OperationalDomainResponse>('get_operational_domain_state', {
    p_domain: 'finance',
  })
  return response.revision
}

const refreshFinance = async (): Promise<void> => {
  const refreshed = await reloadConflictedDomain('finance')
  if (!refreshed) throw new Error('Finance was saved, but the latest ledger could not be reloaded.')
}

export type CashFlowEntryKind = 'opening_balance' | 'adjustment' | 'transfer'

export const createFinanceCashFlowEntry = async (input: {
  kind: CashFlowEntryKind
  accountId: string
  amount: number
  direction?: 'income' | 'expense'
  counterpartyAccountId?: string
  transactionDate?: string
  note?: string
}): Promise<void> => {
  const revision = await getFinanceRevision()
  await getClient().rpc('create_finance_cashflow_entry', {
    p_expected_revision: revision,
    p_kind: input.kind,
    p_account_id: input.accountId,
    p_amount: Math.round(input.amount),
    p_direction: input.direction ?? null,
    p_counterparty_account_id: input.counterpartyAccountId ?? null,
    p_transaction_date: input.transactionDate ?? null,
    p_note: input.note?.trim() || null,
  })
  await refreshFinance()
}

export const editPostedFinanceTransaction = async (input: {
  transactionId: string
  patch: {
    accountId?: string
    amount?: number
    transactionDate?: string
    category?: string
    method?: string
    name?: string
    description?: string
    note?: string
    reference?: string
  }
  reason: string
}): Promise<void> => {
  const revision = await getFinanceRevision()
  await getClient().rpc('edit_finance_transaction', {
    p_expected_revision: revision,
    p_transaction_id: input.transactionId,
    p_patch: input.patch as unknown as Json,
    p_reason: input.reason.trim(),
  })
  await refreshFinance()
}
