import type { Json } from './shared/databaseTypes'
import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { reloadConflictedDomain } from './operationalSupabaseSync'
import type {
  FinanceCategory,
  FinancePaymentMethod,
  FinanceTransactionScope,
  FinanceTransactionType,
} from '../store/financeStoreTypes'
import type { BranchId } from '../types/orders'

interface OperationalDomainResponse {
  domain: 'finance'
  revision: number
  snapshot: Json | null
  updatedAt: string | null
  transactionId?: string
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

export interface ManualFinanceTransactionInput {
  transactionId?: string
  type: FinanceTransactionType
  category: FinanceCategory
  scope: FinanceTransactionScope
  branch: BranchId | ''
  accountId: string
  amount: number
  method: FinancePaymentMethod
  name: string
  note?: string
  manualEntryReason?: string
  transactionDate: string
  transactionCode?: string
  proofPath: string
  proofFileName?: string
  transferFee?: number
  editReason?: string
}

export const saveManualFinanceTransaction = async (
  input: ManualFinanceTransactionInput,
): Promise<string | undefined> => {
  const revision = await getFinanceRevision()
  const payload = {
    type: input.type,
    category: input.category,
    scope: input.scope,
    branch: input.scope === 'branch' ? input.branch : 'All',
    accountId: input.accountId,
    amount: Math.round(input.amount),
    method: input.method,
    name: input.name.trim(),
    note: input.note?.trim() || null,
    manualEntryReason: input.manualEntryReason?.trim() || null,
    transactionDate: input.transactionDate,
    transactionCode: input.transactionCode?.trim().toUpperCase() || '-',
    proofPath: input.proofPath,
    proofFileName: input.proofFileName ?? null,
  }

  const response = await getClient().rpc<OperationalDomainResponse>('save_manual_finance_transaction', {
    p_expected_revision: revision,
    p_payload: payload as unknown as Json,
    p_transfer_fee: input.transactionId ? 0 : Math.max(0, Math.round(input.transferFee ?? 0)),
    p_transaction_id: input.transactionId ?? null,
    p_edit_reason: input.editReason?.trim() || null,
  })

  await refreshFinance()
  return response.transactionId
}
