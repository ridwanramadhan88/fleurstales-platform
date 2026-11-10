import { getSupabaseAuthClient } from '../api/supabaseAuth'
import type { MonthlyHighlight } from '../domain/monthlyHighlightDomain'

const normalize = (value: unknown): MonthlyHighlight | null => {
  if (!value || typeof value !== 'object') return null
  const row = value as { month?: unknown; note?: unknown; productIds?: unknown }
  if (typeof row.month !== 'string') return null
  return {
    month: row.month,
    note: typeof row.note === 'string' ? row.note : null,
    productIds: Array.isArray(row.productIds) ? row.productIds.filter((id): id is string => typeof id === 'string') : [],
  }
}

/** This month and next month, for catalog editors. */
export const fetchMonthlyHighlights = async (): Promise<MonthlyHighlight[]> => {
  const client = getSupabaseAuthClient()
  if (!client) return []
  const { data, error } = await client.rpc('get_catalog_monthly_highlights')
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? data.map(normalize).filter((row): row is MonthlyHighlight => row !== null) : []
}

export const saveMonthlyHighlight = async (highlight: MonthlyHighlight): Promise<MonthlyHighlight> => {
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase is not configured.')
  const { data, error } = await client.rpc('save_catalog_monthly_highlight', {
    p_month: highlight.month,
    p_product_ids: highlight.productIds,
    p_note: highlight.note,
  })
  if (error) throw new Error(error.message)
  return normalize(data) ?? highlight
}
