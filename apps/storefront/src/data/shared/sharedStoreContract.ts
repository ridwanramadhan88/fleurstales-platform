/**
 * Dependency-free public Store contract validation.
 * This file intentionally imports only shared transport types so migration,
 * parity, and simulation tooling can run without Zustand or app settings types.
 */
import type { BranchDayHours, SharedStoreSnapshot } from './contracts'

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

const isClockTime = (value: unknown): value is string =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

const validateDayHours = (branchId: string, day: string, hours: BranchDayHours | undefined): string[] => {
  if (!hours) return [`Branch ${branchId} is missing ${day} opening hours.`]
  if (!hours.isOpen) return []
  if (!isClockTime(hours.opensAt) || !isClockTime(hours.closesAt)) {
    return [`Branch ${branchId} has invalid ${day} opening hours.`]
  }
  if (hours.opensAt >= hours.closesAt) return [`Branch ${branchId} has invalid ${day} opening hours.`]
  return []
}

export const validateSharedStoreSnapshot = (snapshot: SharedStoreSnapshot): string[] => {
  const errors: string[] = []
  if (!snapshot.profile.storeName.trim()) errors.push('Store name is required.')
  if (snapshot.profile.currency !== 'IDR') errors.push('Store currency must be IDR.')
  if (snapshot.profile.timezone !== 'Asia/Jakarta') errors.push('Store timezone must be Asia/Jakarta.')

  const branchIds = new Set<string>()
  const branchCodes = new Set<string>()
  let activeDefaultBranches = 0
  for (const branch of snapshot.branches) {
    if (!branch.id.trim()) errors.push('Branch id is required.')
    if (branchIds.has(branch.id)) errors.push(`Duplicate branch id: ${branch.id}`)
    branchIds.add(branch.id)

    const code = branch.code.trim().toUpperCase()
    if (!code) errors.push(`Branch ${branch.id} is missing a code.`)
    if (branchCodes.has(code)) errors.push(`Duplicate branch code: ${code}`)
    branchCodes.add(code)

    if (branch.deliveryFeeIdr < 0 || !Number.isFinite(branch.deliveryFeeIdr)) {
      errors.push(`Branch ${branch.id} has an invalid delivery fee.`)
    }
    if (branch.isActive && branch.isDefault) activeDefaultBranches += 1
    for (const day of WEEKDAYS) errors.push(...validateDayHours(branch.id, day, branch.openingHours[day]))
  }

  const activeBranches = snapshot.branches.filter((branch) => branch.isActive)
  if (activeBranches.length === 0) errors.push('At least one active branch is required.')
  if (activeBranches.length > 0 && activeDefaultBranches !== 1) {
    errors.push('Exactly one active branch must be the default.')
  }

  const paymentIds = new Set<string>()
  for (const account of snapshot.paymentAccounts) {
    if (!account.id.trim()) errors.push('Payment account id is required.')
    if (paymentIds.has(account.id)) errors.push(`Duplicate payment account id: ${account.id}`)
    paymentIds.add(account.id)
    const unknownBranch = account.branchIds.find((branchId) => !branchIds.has(branchId))
    if (unknownBranch) errors.push(`Payment account ${account.id} references unknown branch ${unknownBranch}.`)
  }

  const activeAccounts = snapshot.paymentAccounts.filter((account) => account.isActive)
  if (activeAccounts.length === 0) errors.push('At least one active payment account is required.')
  if (activeAccounts.filter((account) => account.isDefault).length !== 1) {
    errors.push('Exactly one active payment account must be the default.')
  }
  if (!snapshot.paymentInstructions.trim()) errors.push('Payment instructions are required.')
  return errors
}
