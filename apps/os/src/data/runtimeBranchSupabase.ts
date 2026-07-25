import { bootstrapSharedData } from './shared/bootstrap'
import { browserSupabaseTokenProvider, getSupabaseBrowserSession } from './shared/supabaseSession'

export interface StaffRuntimeContext {
  scheduledBranchId?: string | null
  operationalBranchId?: string | null
  operationalDate: string
  updatedAt?: string
}

export const setRuntimeBranchContext = async (input: {
  scheduledBranchId?: string
  operationalBranchId?: string
  operationalDate: string
}): Promise<StaffRuntimeContext | null> => {
  if (!getSupabaseBrowserSession()) return null
  const boot = bootstrapSharedData(browserSupabaseTokenProvider)
  if (!boot.enabled) return null
  return boot.repositories.client.rpc<StaffRuntimeContext>('set_staff_runtime_context', {
    p_scheduled_branch_id: input.scheduledBranchId ?? null,
    p_operational_branch_id: input.operationalBranchId ?? null,
    p_operational_date: input.operationalDate,
  })
}
