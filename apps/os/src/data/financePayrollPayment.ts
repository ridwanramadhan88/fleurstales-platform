import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import { hydratePayrollFromSupabase } from './payrollSupabaseSync'
import { reloadConflictedDomain } from './operationalSupabaseSync'

interface OperationalDomainResponse {
  domain: 'payroll'
  revision: number
  snapshot: unknown
  updatedAt: string | null
}

const getClient = () => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  return shared.repositories.client
}

export const recordPayrollPaymentWithAccount = async (input: {
  payrollProposalId: string
  paymentDate: string
  paymentMethod: string
  paymentReference: string
  financeAccountId: string
  transferFee?: number
  note?: string
}): Promise<void> => {
  const client = getClient()
  const state = await client.rpc<OperationalDomainResponse>('get_operational_domain_state', {
    p_domain: 'payroll',
  })

  await client.rpc('record_payroll_payment_with_account', {
    p_expected_revision: state.revision,
    p_payroll_proposal_id: input.payrollProposalId,
    p_payment_date: input.paymentDate,
    p_payment_method: input.paymentMethod.trim(),
    p_payment_reference: input.paymentReference.trim(),
    p_finance_account_id: input.financeAccountId,
    p_transfer_fee: Math.max(0, Math.round(input.transferFee ?? 0)),
    p_note: input.note?.trim() || null,
  })

  const [payrollRefreshed, financeRefreshed] = await Promise.all([
    hydratePayrollFromSupabase().catch(() => false),
    reloadConflictedDomain('finance').catch(() => false),
  ])
  if (!payrollRefreshed || !financeRefreshed) {
    throw new Error('Payroll was paid, but the latest Payroll or Finance ledger could not be reloaded.')
  }
}
