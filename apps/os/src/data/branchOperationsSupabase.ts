import { getSupabaseAuthClient } from '../api/supabaseAuth'
import type { BranchSettings } from '../types/settings'
import { DEFAULT_BRANCH_OPENING_HOURS } from '../domain/branchOpeningHoursDomain'

/** Saves hours, flat delivery fee and distance tariff for one branch. Never touches name, address or location. */
export const saveBranchOperations = async (branch: BranchSettings): Promise<void> => {
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase is not configured.')
  const { error } = await client.rpc('save_branch_operations', {
    p_branch_id: branch.id,
    p_opening_hours: branch.openingHours ?? DEFAULT_BRANCH_OPENING_HOURS,
    p_delivery_fee_idr: Math.max(0, Math.round(branch.deliveryFeeIdr ?? 0)),
    p_delivery_tariff: branch.deliveryTariff ?? null,
  })
  if (error) throw new Error(error.message)
}
