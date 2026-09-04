import type { BranchFilter } from '../types/orders'
import type { UserRole } from '../store/userStore'

/**
 * Roles whose branch selector changes their operational runtime context.
 * Admin is intentionally excluded: an Admin's operational branch is fixed by
 * the dated schedule/runtime context, while the shared branch selector is only
 * a company-wide browsing filter for them. Florist still uses the selector as
 * an operational override because assigned work may be cross-branch.
 */
export const isOperationalBranchRole = (role: UserRole): boolean =>
  role === 'florist'

export const getBranchSwitchDecision = ({
  role,
  scheduledBranchId,
  targetBranch,
}: {
  role: UserRole
  scheduledBranchId?: string
  targetBranch: BranchFilter
}): {
  allowed: boolean
  requiresConfirmation: boolean
  reason?: string
} => {
  // Owner/Admin/Finance/HR branch selection is a read filter. Admin mutation
  // authority is enforced separately against the dated operational branch.
  if (!isOperationalBranchRole(role)) {
    return { allowed: true, requiresConfirmation: false }
  }

  if (targetBranch === 'All') {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: 'Select one active branch for operational work.',
    }
  }

  if (scheduledBranchId === targetBranch) {
    return { allowed: true, requiresConfirmation: false }
  }

  return {
    allowed: true,
    requiresConfirmation: true,
    reason: scheduledBranchId
      ? `This is not the branch assigned to you in today's schedule. You are scheduled at ${scheduledBranchId}. Continue with ${targetBranch}?`
      : `You do not have a branch assignment in today's schedule. Continue working at ${targetBranch}?`,
  }
}
