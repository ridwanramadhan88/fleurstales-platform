import type { BranchSettings } from '../types/settings'
import { DEFAULT_BRANCH_OPENING_HOURS } from './branchOpeningHoursDomain'

/** Fields the Manager may change on a branch; everything else stays as saved. */
export const branchOperationsKey = (branch: BranchSettings): string =>
  JSON.stringify({
    openingHours: branch.openingHours ?? DEFAULT_BRANCH_OPENING_HOURS,
    deliveryFeeIdr: branch.deliveryFeeIdr ?? 0,
    deliveryTariff: branch.deliveryTariff ?? null,
  })

export const changedBranchOperations = (saved: BranchSettings[], draft: BranchSettings[]): BranchSettings[] => {
  const savedById = new Map(saved.map((branch) => [branch.id, branch]))
  return draft.filter((branch) => {
    const before = savedById.get(branch.id)
    return before !== undefined && branchOperationsKey(before) !== branchOperationsKey(branch)
  })
}

export const clampCoverage = (value: number): number => Math.min(50, Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0)))
