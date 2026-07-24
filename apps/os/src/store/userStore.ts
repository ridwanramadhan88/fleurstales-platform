/** Demo user session store. Production should replace this with server auth. */
import { create } from 'zustand'
import { emitUserUpdated } from '../core/events/eventService'

export type UserRole = 'owner' | 'admin' | 'finance' | 'hr' | 'florist'

export interface BranchOverrideRecord {
  scheduledBranchId?: string
  selectedBranchId: string
  date: string
  changedAt: string
}

export interface SessionAccount {
  employeeId: string
  name: string
  username: string
  role: UserRole
  /** Current operational branch used by row-level authorization. */
  branchId?: string
  /** Branch assigned by today's effective schedule. Never changed by a UI override. */
  scheduledBranchId?: string
}

interface UserState extends SessionAccount {
  branchOverrideActive: boolean
  lastBranchOverride?: BranchOverrideRecord
  setRole: (role: UserRole) => void
  signIn: (account: SessionAccount) => void
  setOperationalBranch: (branchId: string, date: string) => void
}

const ROLE_NAMES: Record<UserRole, string> = {
  owner: 'Budi', admin: 'Sari', finance: 'Dewi', hr: 'Star', florist: 'Agus',
}

export const useUserStore = create<UserState>((set) => ({
  employeeId: 'emp-sari',
  name: ROLE_NAMES.admin,
  username: 'admin',
  role: 'admin',
  branchId: undefined,
  scheduledBranchId: undefined,
  branchOverrideActive: false,
  lastBranchOverride: undefined,
  setRole: (role) => set(() => {
    const name = ROLE_NAMES[role]
    emitUserUpdated({ name, role })
    return {
      role,
      name,
      username: role,
      employeeId: `demo-${role}`,
      branchId: undefined,
      scheduledBranchId: undefined,
      branchOverrideActive: false,
      lastBranchOverride: undefined,
    }
  }),
  signIn: (account) => set(() => {
    emitUserUpdated({ name: account.name, role: account.role })
    const scheduledBranchId = account.scheduledBranchId ?? account.branchId
    return {
      ...account,
      scheduledBranchId,
      branchOverrideActive: false,
      lastBranchOverride: undefined,
    }
  }),
  setOperationalBranch: (branchId, date) => set((state) => {
    const isOverride = Boolean(state.scheduledBranchId) && state.scheduledBranchId !== branchId
    const noScheduledBranchOverride = !state.scheduledBranchId
    return {
      branchId,
      branchOverrideActive: isOverride || noScheduledBranchOverride,
      lastBranchOverride: isOverride || noScheduledBranchOverride
        ? {
            scheduledBranchId: state.scheduledBranchId,
            selectedBranchId: branchId,
            date,
            changedAt: new Date().toISOString(),
          }
        : undefined,
    }
  }),
}))
