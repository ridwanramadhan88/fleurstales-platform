import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider } from './shared/supabaseSession'
import type { FinanceCategoryOverride, FinanceCustomCategory, FinanceTransaction } from '../store/financeStoreTypes'

export interface FinanceReportLedger {
  transactions: FinanceTransaction[]
  customCategories: FinanceCustomCategory[]
  categoryOverrides: FinanceCategoryOverride[]
}

/** Read-only ledger for the LK report: Finance and the Owner (who cannot open the Finance workspace). */
export const fetchFinanceReportLedger = async (): Promise<FinanceReportLedger> => {
  const shared = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!shared.enabled) throw new Error('Supabase is not configured.')
  const result = await shared.repositories.client.rpc<Partial<FinanceReportLedger> | null>('get_finance_report_ledger', {})
  return {
    transactions: Array.isArray(result?.transactions) ? result.transactions : [],
    customCategories: Array.isArray(result?.customCategories) ? result.customCategories : [],
    categoryOverrides: Array.isArray(result?.categoryOverrides) ? result.categoryOverrides : [],
  }
}
