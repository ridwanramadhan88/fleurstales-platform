import type { BranchFilter } from '../types/orders'
import type { UserRole } from '../store/userStore'

export const isOperationalBranchRole = (role: UserRole): boolean =>
  role === 'admin' || role === 'florist'

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
