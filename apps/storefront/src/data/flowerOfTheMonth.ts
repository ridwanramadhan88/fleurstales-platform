import { bootstrapSharedData } from './shared/bootstrap'
import type { MonthlyHighlight } from '../domain/monthlyHighlightDomain'

/** This month's hand-picked products for the shop. Never blocks or breaks the shop. */
export const fetchFlowerOfTheMonth = async (): Promise<MonthlyHighlight | null> => {
  try {
    const shared = bootstrapSharedData()
    if (!shared.enabled) return null
    const result = await shared.repositories.client.rpc<{ month?: string; note?: string | null; productIds?: unknown } | null>('get_flower_of_the_month', {})
    if (!result || typeof result.month !== 'string' || !Array.isArray(result.productIds)) return null
    return {
      month: result.month,
      note: typeof result.note === 'string' ? result.note : null,
      productIds: result.productIds.filter((id): id is string => typeof id === 'string'),
    }
  } catch {
    return null
  }
}
