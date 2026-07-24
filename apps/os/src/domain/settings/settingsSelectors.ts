/**
 * @file settingsSelectors.ts
 * @description Pure selectors over `OwnerSettingsStateValue`. UI/controllers
 * should read settings through these instead of reaching into raw settings
 * state directly, so business rules (e.g. "inactive branches are hidden")
 * live in one place.
 */

import type { BranchFilter } from '../../types/orders'
import type { OwnerSettingsStateValue } from '../../types/settings'

/**
 * @description Returns only active branches, in settings order.
 */
export const getActiveBranches = (
  settings: Pick<OwnerSettingsStateValue, 'branches'>,
) => settings.branches.filter((branch) => branch.isActive)

/**
 * @description Full set of selectable values for the global branch switcher
 * (top bar, sidebar, BranchSelect page), derived from active branches only.
 * Replaces the old hardcoded `BRANCH_FILTER_OPTIONS` constant.
 */
export const getBranchFilterOptions = (
  settings: Pick<OwnerSettingsStateValue, 'branches'>,
): BranchFilter[] => ['All', ...getActiveBranches(settings).map((branch) => branch.id)]

/**
 * @description Looks up a branch's display name by id, falling back to the
 * id itself if the branch was removed/renamed (e.g. for historical orders
 * still referencing an old branch id).
 */
export const getBranchDisplayName = (
  settings: Pick<OwnerSettingsStateValue, 'branches'>,
  branchId: string,
): string =>
  settings.branches.find((branch) => branch.id === branchId)?.name ?? branchId

