import type { UserRole } from '../store/userStore'
import type { PermissionMatrix } from '../types/settings'
import { canAccessSection, type AppSection } from './permissions'

export type ActionCapability =
  | 'finance.view_collect_orders'
  | 'finance.verify_order'
  | 'finance.view_payroll'
  | 'finance.approve_employee_payroll'
  | 'finance.approve_all_payroll'
  | 'finance.reject_employee_payroll'
  | 'finance.record_final_payment'
  | 'finance.view_refunds'
  | 'finance.approve_refund'
  | 'finance.view_ledger'
  | 'finance.create_ledger_entry'
  | 'finance.verify_ledger_entry'
  | 'hr.view_employees'
  | 'hr.create_employee'
  | 'hr.edit_employee'
  | 'hr.review_attendance'
  | 'hr.correct_attendance'
  | 'hr.manage_points'
  | 'hr.create_payroll_proposal'
  | 'hr.edit_payroll_proposal'
  | 'hr.resolve_rejected_employee'
  | 'settings.edit_store_profile'
  | 'settings.edit_branches'
  | 'settings.edit_roles'
  | 'settings.edit_permissions'
  | 'settings.edit_payment_methods'
  | 'settings.edit_attendance'
  | 'settings.edit_scheduling'
  | 'settings.edit_payroll'

export type ActionPermissionMatrix = Record<UserRole, Record<ActionCapability, boolean>>

export interface CapabilityDefinition {
  id: ActionCapability
  label: string
  description: string
  parentSection: AppSection
  group: 'Finance' | 'HR' | 'Settings'
}

export const CAPABILITY_REGISTRY: CapabilityDefinition[] = [
  { id:'finance.view_collect_orders', label:'View Payment Verifications', description:'Open the order-verification workspace.', parentSection:'finance', group:'Finance' },
  { id:'finance.verify_order', label:'Verify Orders', description:'Review completed orders.', parentSection:'finance', group:'Finance' },
  { id:'finance.view_payroll', label:'View Payroll', description:'View payroll proposals.', parentSection:'finance', group:'Finance' },
  { id:'finance.approve_employee_payroll', label:'Approve Employee Payroll', description:'Approve one employee payroll.', parentSection:'finance', group:'Finance' },
  { id:'finance.approve_all_payroll', label:'Approve All Payroll', description:'Approve remaining payroll items.', parentSection:'finance', group:'Finance' },
  { id:'finance.reject_employee_payroll', label:'Reject Employee Payroll', description:'Return payroll to HR.', parentSection:'finance', group:'Finance' },
  { id:'finance.record_final_payment', label:'Record Final Payment', description:'Record final payroll payment.', parentSection:'finance', group:'Finance' },
  { id:'finance.view_refunds', label:'View Refunds', description:'Open the refund workspace.', parentSection:'finance', group:'Finance' },
  { id:'finance.approve_refund', label:'Approve Refunds', description:'Review refund requests.', parentSection:'finance', group:'Finance' },
  { id:'finance.view_ledger', label:'View Transactions', description:'Read transaction entries.', parentSection:'finance', group:'Finance' },
  { id:'finance.create_ledger_entry', label:'Create Transactions', description:'Add Money In or Money Out.', parentSection:'finance', group:'Finance' },
  { id:'finance.verify_ledger_entry', label:'Verify Transactions', description:'Verify transaction entries.', parentSection:'finance', group:'Finance' },
  { id:'hr.view_employees', label:'View Employees', description:'Open employee records.', parentSection:'hr', group:'HR' },
  { id:'hr.create_employee', label:'Create Employees', description:'Create a staff account.', parentSection:'hr', group:'HR' },
  { id:'hr.edit_employee', label:'Edit Employees', description:'Edit staff profile and role.', parentSection:'hr', group:'HR' },
  { id:'hr.review_attendance', label:'Review Attendance', description:'Review attendance issues.', parentSection:'hr', group:'HR' },
  { id:'hr.correct_attendance', label:'Correct Attendance', description:'Correct attendance with audit history.', parentSection:'hr', group:'HR' },
  { id:'hr.manage_points', label:'Manage Points', description:'Review employee points.', parentSection:'hr', group:'HR' },
  { id:'hr.create_payroll_proposal', label:'Create Payroll Proposal', description:'Prepare monthly payroll.', parentSection:'hr', group:'HR' },
  { id:'hr.edit_payroll_proposal', label:'Edit Payroll Proposal', description:'Edit payroll before Finance review.', parentSection:'hr', group:'HR' },
  { id:'hr.resolve_rejected_employee', label:'Resolve Rejected Employee', description:'Fix returned payroll.', parentSection:'hr', group:'HR' },
  { id:'settings.edit_store_profile', label:'Edit Store Profile', description:'Edit store details.', parentSection:'settings', group:'Settings' },
  { id:'settings.edit_branches', label:'Edit Branches', description:'Edit branch settings.', parentSection:'settings', group:'Settings' },
  { id:'settings.edit_roles', label:'Edit Staff Roles', description:'Edit staff roles.', parentSection:'settings', group:'Settings' },
  { id:'settings.edit_permissions', label:'Edit Permissions', description:'Edit access permissions.', parentSection:'settings', group:'Settings' },
  { id:'settings.edit_payment_methods', label:'Edit Payment Methods', description:'Edit payment methods.', parentSection:'settings', group:'Settings' },
  { id:'settings.edit_attendance', label:'Edit Attendance Rules', description:'Edit attendance rules.', parentSection:'settings', group:'Settings' },
  { id:'settings.edit_scheduling', label:'Edit Scheduling Rules', description:'Edit scheduling rules.', parentSection:'settings', group:'Settings' },
  { id:'settings.edit_payroll', label:'Edit Payroll Rules', description:'Edit payroll rules.', parentSection:'settings', group:'Settings' },
]

const allFalse = () => Object.fromEntries(CAPABILITY_REGISTRY.map(({id}) => [id, false])) as Record<ActionCapability, boolean>
const withEnabled = (...ids: ActionCapability[]) => ({ ...allFalse(), ...Object.fromEntries(ids.map((id)=>[id,true])) })

export const DEFAULT_ACTION_PERMISSIONS: ActionPermissionMatrix = {
  owner: withEnabled(...CAPABILITY_REGISTRY.map(({ id }) => id)),
  admin: withEnabled(),
  finance: withEnabled('finance.view_collect_orders','finance.verify_order','finance.view_payroll','finance.approve_employee_payroll','finance.approve_all_payroll','finance.reject_employee_payroll','finance.record_final_payment','finance.view_refunds','finance.approve_refund','finance.view_ledger','finance.create_ledger_entry','finance.verify_ledger_entry'),
  hr: withEnabled('hr.view_employees','hr.create_employee','hr.edit_employee','hr.review_attendance','hr.correct_attendance','hr.manage_points','hr.create_payroll_proposal','hr.edit_payroll_proposal','hr.resolve_rejected_employee'),
  florist: withEnabled(),
}

export const getCapabilityDefinition = (capability: ActionCapability) => CAPABILITY_REGISTRY.find((item)=>item.id===capability)!

export const hasActionPermission = (
  role: UserRole,
  capability: ActionCapability,
  actionPermissions: ActionPermissionMatrix = DEFAULT_ACTION_PERMISSIONS,
  sectionPermissions?: PermissionMatrix,
): boolean => {
  const definition = getCapabilityDefinition(capability)
  if (sectionPermissions && !canAccessSection(role, definition.parentSection, sectionPermissions)) return false
  return Boolean(actionPermissions[role]?.[capability])
}

export const guardActionPermissions = (
  matrix: ActionPermissionMatrix,
  sectionPermissions: PermissionMatrix,
): ActionPermissionMatrix => {
  const next = structuredClone(matrix)
  for (const role of Object.keys(next) as UserRole[]) {
    for (const definition of CAPABILITY_REGISTRY) {
      if (!canAccessSection(role, definition.parentSection, sectionPermissions)) next[role][definition.id] = false
    }
  }
  for (const definition of CAPABILITY_REGISTRY.filter((item)=>item.group==='Settings')) {
    next.owner[definition.id] = true
    for (const role of ['admin','finance','hr','florist'] as UserRole[]) next[role][definition.id] = false
  }
  return next
}
