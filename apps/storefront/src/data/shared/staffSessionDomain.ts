import type { SharedStaffAccessProfile } from './contracts'
import type { StaffRole } from './databaseTypes'

export type SharedSessionSource = 'anonymous' | 'local_demo' | 'legacy_shared_backend' | 'supabase'

export interface SharedAnonymousSession {
  kind: 'anonymous'
  source: 'anonymous'
}

export interface SharedStaffSession {
  kind: 'staff'
  source: Exclude<SharedSessionSource, 'anonymous'>
  /** Supabase Auth user ID when a live Supabase session is attached. */
  userId?: string
  employeeId?: string
  displayName: string
  role: StaffRole
  username?: string
  email?: string
  /** Operational/default branch attached to the staff access profile. */
  branchId?: string
  isActive: boolean
}

export type SharedSession = SharedAnonymousSession | SharedStaffSession

export type SharedDataCapability =
  | 'catalog:read'
  | 'catalog:write'
  | 'catalog:cost:read'
  | 'store:read'
  | 'store:write'
  | 'customers:read'
  | 'customers:write'
  | 'orders:read'
  | 'orders:write'

const VALID_STAFF_ROLES = new Set<StaffRole>(['owner', 'admin', 'finance', 'hr', 'florist'])

export const isStaffRole = (value: unknown): value is StaffRole =>
  typeof value === 'string' && VALID_STAFF_ROLES.has(value as StaffRole)

export const anonymousSharedSession = (): SharedAnonymousSession => ({ kind: 'anonymous', source: 'anonymous' })

export const buildLocalStaffSession = (input: {
  employeeId?: string
  displayName: string
  role: StaffRole
  branchId?: string
  source?: 'local_demo' | 'legacy_shared_backend'
}): SharedStaffSession => ({
  kind: 'staff',
  source: input.source ?? 'local_demo',
  employeeId: input.employeeId,
  displayName: input.displayName.trim() || input.role,
  role: input.role,
  branchId: input.branchId,
  isActive: true,
})

export const buildSupabaseStaffSession = (profile: SharedStaffAccessProfile): SharedStaffSession => ({
  kind: 'staff',
  source: 'supabase',
  userId: profile.userId,
  employeeId: profile.employeeId,
  displayName: profile.displayName,
  role: profile.role,
  username: profile.username,
  email: profile.email,
  branchId: profile.branchId,
  isActive: profile.isActive,
})

export const canSharedSession = (session: SharedSession, capability: SharedDataCapability): boolean => {
  if (capability === 'catalog:read' || capability === 'store:read') return true
  if (session.kind !== 'staff' || !session.isActive) return false

  switch (capability) {
    case 'catalog:write': return session.role === 'owner' || session.role === 'admin'
    case 'catalog:cost:read': return session.role === 'owner' || session.role === 'finance'
    case 'store:write': return session.role === 'owner'
    case 'customers:read': return session.role === 'owner' || session.role === 'admin' || session.role === 'finance'
    case 'customers:write': return session.role === 'owner' || session.role === 'admin'
    case 'orders:read': return session.role !== 'hr'
    case 'orders:write': return session.role === 'owner' || session.role === 'admin' || session.role === 'finance'
    default: return false
  }
}
