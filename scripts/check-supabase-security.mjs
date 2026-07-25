#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (relative) => readFile(path.join(root, relative), 'utf8')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const [
  baseHardening,
  authority,
  events,
  payroll,
  orders,
  modules,
  sensitiveDomains,
  notificationAuthority,
  authorizationSync,
  operationalSync,
  payrollSync,
  realtimeSync,
  orderBridge,
  actionPermissions,
  sectionPermissions,
  staffSettingsRuntime,
  internalSettingsSync,
  runtimeBranchSync,
  staffLifecycleSync,
  appSource,
  homeSource,
  loginSource,
  staffAdminFunction,
  staffLoginFunction,
  releaseWorkflow,
] = await Promise.all([
  read('supabase/migrations/20260725203000_security_concurrency_hardening.sql'),
  read('supabase/migrations/20260725213000_authoritative_permissions.sql'),
  read('supabase/migrations/20260725213500_activity_notifications_infrastructure.sql'),
  read('supabase/migrations/20260725214000_payroll_workflow_authority.sql'),
  read('supabase/migrations/20260725215000_order_authority_events.sql'),
  read('supabase/migrations/20260725216000_configured_module_authority.sql'),
  read('supabase/migrations/20260725217000_sensitive_operational_authority.sql'),
  read('supabase/migrations/20260725218000_notification_permission_authority.sql'),
  read('apps/os/src/data/authorizationSupabaseSync.ts'),
  read('apps/os/src/data/operationalSupabaseSync.ts'),
  read('apps/os/src/data/payrollSupabaseSync.ts'),
  read('apps/os/src/data/realtimeSupabaseSync.ts'),
  read('apps/os/src/data/shared/orderBridge.ts'),
  read('apps/os/src/config/actionPermissions.ts'),
  read('apps/os/src/config/permissions.ts'),
  read('supabase/migrations/20260725223000_staff_settings_runtime_authority.sql'),
  read('apps/os/src/data/internalSettingsSupabaseSync.ts'),
  read('apps/os/src/data/runtimeBranchSupabase.ts'),
  read('apps/os/src/data/staffLifecycleSupabase.ts'),
  read('apps/os/src/App.tsx'),
  read('apps/os/src/pages/Home.tsx'),
  read('apps/os/src/pages/Login.tsx'),
  read('supabase/functions/staff-admin/index.ts'),
  read('supabase/functions/staff-login/index.ts'),
  read('.github/workflows/release-production.yml'),
])

// V3.1 foundation remains present.
assert(baseHardening.includes('private.operational_domain_state'), 'Private operational-domain storage is missing.')
assert(baseHardening.includes('private.audit_events'), 'Private immutable audit table is missing.')
assert(baseHardening.includes("employee - 'pin'"), 'Legacy HR PIN scrub is missing.')
assert(baseHardening.includes('revoke insert, update, delete on public.orders from authenticated'), 'Direct Orders writes are not revoked.')

// 12A: Owner-configured authorization is a database source of truth.
for (const table of ['authorization_state','role_section_permissions','action_capability_registry','role_action_permissions','feature_settings']) {
  assert(authority.includes(`private.${table}`), `Authorization table ${table} is missing.`)
}
for (const helper of ['has_section_access_for_role','has_section_access','has_action_permission_for_role','has_action_permission','feature_enabled']) {
  assert(authority.includes(`private.${helper}`), `Authorization helper ${helper} is missing.`)
}
assert(authority.includes('public.get_authorization_config'), 'Authorization read RPC is missing.')
assert(authority.includes('public.save_authorization_config'), 'Authorization save RPC is missing.')
assert(authority.includes('REVISION_CONFLICT:authorization'), 'Authorization optimistic concurrency is missing.')
assert(authority.includes("v_role = 'owner' and v_access = 'none'"), 'Owner lockout protection is missing at the server boundary.')
assert(authority.includes("when 'payroll' then false"), 'Generic Payroll writes must remain disabled.')
assert(authority.includes("private.has_action_permission('orders.read_assigned')"), 'Assigned-work authorization capability is missing.')
assert(!authority.includes('perform private.write_business_activity('), 'Authorization migration must not forward-reference later activity helpers.')

// 12E/F: durable events + per-user notifications, no client write access.
assert(events.includes('public.business_activities'), 'Durable business activity table is missing.')
assert(events.includes('public.staff_notifications'), 'Server notification table is missing.')
assert(events.includes('revoke all on table public.business_activities from anon, authenticated'), 'Activity table is client-writable.')
assert(events.includes('revoke all on table public.staff_notifications from anon, authenticated'), 'Notification table is client-writable.')
assert(events.includes('public.mark_notifications_read'), 'Notification read RPC is missing.')
assert(events.includes('public.record_mutation_conflict'), 'Out-of-transaction mutation-conflict audit RPC is missing.')
assert(events.includes('authorization_state_changed_events'), 'Authorization change event trigger is missing.')
assert(events.includes("alter publication supabase_realtime add table public.staff_notifications"), 'Notifications are not published to Realtime.')

// 12B: Payroll commands are separately authorized and scoped.
for (const rpc of [
  'payroll_set_compensation','payroll_prepare','payroll_generate','payroll_submit',
  'payroll_resolve_rejected','payroll_approve_employee','payroll_reject_employee',
  'payroll_approve_all','payroll_record_payment','payroll_adjust_schedule',
]) {
  assert(payroll.includes(`public.${rpc}`), `Payroll RPC ${rpc} is missing.`)
}
assert(payroll.includes('PAYROLL_COMMAND_SCOPE_VIOLATION'), 'Payroll command top-level mutation isolation is missing.')
assert(payroll.includes('PAYROLL_HR_CANNOT_MUTATE_FINANCE_FIELDS'), 'HR→Finance Payroll field boundary is missing.')
assert(payroll.includes('PAYROLL_FINANCE_CANNOT_MUTATE_HR_FIELDS'), 'Finance→HR Payroll field boundary is missing.')
assert(payroll.includes('PAYROLL_FORGED_REVIEW_ACTOR'), 'Payroll actor verification is missing.')
assert(payroll.includes('PAYROLL_FORGED_COMPENSATION_ACTOR'), 'Payroll compensation actor verification is missing.')
assert(payroll.includes("'payroll-expense:' || v_proposal_id"), 'Payroll payment→Finance expense idempotency link is missing.')
assert(payroll.includes("domain='finance'\n    for update"), 'Payroll payment does not atomically lock/update Finance state.')

// 12C: Orders use an authenticated wrapper around the proven V3.1 validator.
assert(orders.includes('save_order_operational_state_v31_internal'), 'V3.1 Order validator was not preserved as an internal boundary.')
assert(orders.includes('from public, anon, authenticated'), 'Internal Order writer must have client execution revoked.')
assert(orders.includes("private.has_action_permission('orders.assign')"), 'Order assignment capability is not enforced server-side.')
assert(orders.includes("private.has_action_permission('finance.verify_order')"), 'Finance verification capability is not enforced server-side.')
assert(orders.includes('FLORIST_REQUIRED_BEFORE_PROCESSING'), 'Confirmed→Processing florist requirement is missing.')
assert(orders.includes('ORDER_UNDO_EVIDENCE_REQUIRED'), 'Exact server-evidenced Undo validation is missing.')
assert(orders.includes("jsonb_build_object('requestedBy',v_actor_name,'requestedAt',v_now)"), 'Change-request actor evidence is still browser-controlled.')
for (const actorField of ['finance_verified_by','finance_verification_actor','refund_initiated_by','refund_completed_by','refund_cancelled_by','florist_assigned_by_name']) {
  assert(orders.includes(`'${actorField}'`), `Server actor protection for ${actorField} is missing.`)
}
assert(orders.includes("'order_change_requested'"), 'Change-request Finance notification is missing.')
assert(orders.includes("'order_change_resolved'"), 'Change-request resolution notification is missing.')

// 12A continued: legacy Catalog/CRM direct-write and role-list bypasses are closed.
assert(modules.includes('revoke insert, update, delete on public.customers from authenticated'), 'Direct CRM writes remain available.')
assert(modules.includes('revoke insert, update, delete on public.products from authenticated'), 'Direct Catalog writes remain available.')
assert(modules.includes('private.can_manage_customers()'), 'CRM mutation RPC does not use configured Customers permission.')
assert(modules.includes("private.has_section_access('catalog','view')"), 'Catalog editor hydration does not use configured Catalog view permission.')
assert(modules.includes("private.has_section_access('catalog','edit')"), 'Catalog mutations do not use configured Catalog edit permission.')
assert(modules.includes("bucket_id = 'product-images' and private.has_section_access('catalog','edit')"), 'Product-image Storage writes do not use configured Catalog permission.')
assert(modules.includes("private.has_action_permission('settings.edit_store_profile')"), 'Store Settings RPC does not use backend capability authorization.')

// 12B continued: HR/Finance no longer use unrestricted generic snapshot writes.
assert(sensitiveDomains.includes('public.save_hr_operational_state'), 'Dedicated HR operational writer is missing.')
assert(sensitiveDomains.includes('public.save_finance_operational_state'), 'Dedicated Finance operational writer is missing.')
assert(sensitiveDomains.includes("when 'hr' then false"), 'HR can still use the generic operational writer.')
assert(sensitiveDomains.includes("when 'finance' then false"), 'Finance can still use the generic operational writer.')
assert(sensitiveDomains.includes('HR_PIN_MUST_NOT_BE_PERSISTED'), 'HR dedicated writer does not reject PIN material.')
assert(sensitiveDomains.includes("private.has_action_permission('hr.create_employee')"), 'HR employee create permission is not enforced server-side.')
assert(sensitiveDomains.includes("private.has_action_permission('hr.edit_employee')"), 'HR employee edit permission is not enforced server-side.')
assert(sensitiveDomains.includes("private.has_action_permission('hr.correct_attendance')"), 'HR attendance mutation permission is not enforced server-side.')
assert(sensitiveDomains.includes("private.has_action_permission('hr.manage_points')"), 'HR points mutation permission is not enforced server-side.')
assert(sensitiveDomains.includes("private.has_action_permission('finance.create_ledger_entry')"), 'Finance ledger create permission is not enforced server-side.')
assert(sensitiveDomains.includes("private.has_action_permission('finance.verify_ledger_entry')"), 'Finance ledger verification permission is not enforced server-side.')
assert(sensitiveDomains.includes('FINANCE_LEDGER_ENTRY_IMMUTABLE'), 'Finance existing ledger rows are not immutable outside decision fields.')

// Notification delivery/read visibility must follow the same backend matrix.
assert(notificationAuthority.includes('notification_kind_allowed_for_role'), 'Notification capability filter is missing.')
assert(notificationAuthority.includes('can_read_staff_notification'), 'Notification RLS helper is missing.')
assert(notificationAuthority.includes("private.has_action_permission_for_role(p_role,'orders.read_all')"), 'Order notifications bypass configured Orders visibility.')
assert(notificationAuthority.includes("private.has_action_permission_for_role(p_role,'finance.view_payroll')"), 'Payroll notifications bypass configured Finance visibility.')
assert(notificationAuthority.includes("private.has_action_permission('finance.view_ledger')"), 'Finance activity visibility bypasses ledger-view permission.')

// OS clients must consume the new authority rather than retain local-only writes.
assert(actionPermissions.includes("'orders.read_assigned'"), 'OS detailed permission registry lacks assigned Orders capability.')
assert(authorizationSync.includes("'get_authorization_config'"), 'OS does not hydrate backend authorization config.')
assert(authorizationSync.includes("'save_authorization_config'"), 'Owner Settings do not persist backend authorization config.')
assert(authorizationSync.includes("'record_mutation_conflict'"), 'Authorization conflicts are not durably reported.')
assert(!operationalSync.includes("['payroll', usePayrollStore]"), 'Payroll is still subscribed to the generic operational writer.')
assert(operationalSync.includes("case 'payroll': return false"), 'Generic operational sync can still write Payroll.')
assert(operationalSync.includes("'save_hr_operational_state'"), 'OS HR sync does not use the dedicated writer.')
assert(operationalSync.includes("'save_finance_operational_state'"), 'OS Finance sync does not use the dedicated writer.')
assert(payrollSync.includes('subscribePayrollWorkflowMutations'), 'Payroll dedicated command sync is not connected.')
assert(payrollSync.includes("'payroll_record_payment'"), 'Payroll final-payment RPC is not connected.')
assert(realtimeSync.includes("table: 'staff_notifications'"), 'OS notification Realtime subscription is missing.')
assert(realtimeSync.includes("table: 'business_activities'"), 'OS business-activity Realtime subscription is missing.')
assert(realtimeSync.includes("table: 'orders'"), 'OS Order Realtime subscription is missing.')
assert(realtimeSync.includes('hydrateServerOrderActivities'), 'OS does not hydrate server Order activities.')
assert(orderBridge.includes("'save_order_operational_state'"), 'Orders bridge is not using the secured aggregate RPC.')
assert(!orderBridge.includes("client.update('orders'"), 'Orders bridge contains a direct table UPDATE bypass.')


// V3.3: production staff identity, durable internal Settings, runtime branch,
// safe role-family capability semantics, and exact payroll payment behavior.
assert(staffSettingsRuntime.includes('private.section_role_eligible'), 'Workspace role-family eligibility is missing.')
assert(staffSettingsRuntime.includes('guard_role_section_domain'), 'Cross-domain workspace grants are not normalized server-side.')
assert(sectionPermissions.includes('SECTION_ALLOWED_ROLES'), 'OS workspace matrix does not mirror backend safe role families.')
assert(sectionPermissions.includes('isSectionEligibleForRole'), 'OS workspace access does not enforce role-family eligibility.')
assert(staffSettingsRuntime.includes('allowed_roles text[]'), 'Capability role-family eligibility is missing.')
assert(staffSettingsRuntime.includes("when 'orders.read_all' then array['owner','admin','finance']"), 'Orders role-family eligibility is incomplete.')
assert(staffSettingsRuntime.includes("when 'hr.create_employee' then array['owner','hr']"), 'HR staff-management role-family eligibility is incomplete.')
assert(staffSettingsRuntime.includes("if not (p_role = any(v_registry.allowed_roles)) then return false"), 'Backend capability checks ignore safe role families.')
assert(actionPermissions.includes('CAPABILITY_ALLOWED_ROLES'), 'OS capability registry does not mirror backend role-family eligibility.')
assert(actionPermissions.includes('isCapabilityEligibleForRole'), 'OS does not guard ineligible role/capability combinations.')

assert(staffSettingsRuntime.includes('private.internal_settings_state'), 'Authoritative internal Settings state is missing.')
assert(staffSettingsRuntime.includes('public.get_internal_settings_config'), 'Internal Settings hydration RPC is missing.')
assert(staffSettingsRuntime.includes('public.save_internal_settings_config'), 'Internal Settings save RPC is missing.')
assert(staffSettingsRuntime.includes('REVISION_CONFLICT:internal_settings'), 'Internal Settings optimistic concurrency is missing.')
for (const key of ['staff_roles','attendance','scheduling','payroll','scheduling_revisions','payroll_revisions']) {
  assert(staffSettingsRuntime.includes(key), `Server Settings state is missing ${key}.`)
}
assert(internalSettingsSync.includes("'get_internal_settings_config'"), 'OS does not hydrate internal Settings from Supabase.')
assert(internalSettingsSync.includes("'save_internal_settings_config'"), 'Owner internal Settings do not persist to Supabase.')
assert(appSource.indexOf('await connectInternalSettingsSupabase()') < appSource.indexOf('getEffectiveScheduleForDate({'), 'Schedule branch is still calculated before authoritative Settings hydration.')

assert(staffSettingsRuntime.includes('private.staff_runtime_context'), 'Runtime branch context table is missing.')
assert(staffSettingsRuntime.includes('session_id uuid primary key'), 'Runtime branch context is not isolated per Auth session.')
assert(staffSettingsRuntime.includes("auth.jwt()->>'session_id'"), 'Runtime branch RLS does not bind to the current Auth session.')
assert(staffSettingsRuntime.includes('AUTH_SESSION_REQUIRED'), 'Runtime branch setter does not require an Auth session id.')
assert(staffSettingsRuntime.includes('public.set_staff_runtime_context'), 'Runtime branch RPC is missing.')
assert(staffSettingsRuntime.includes('private.current_staff_branch_id()'), 'RLS branch helper is not redefined for runtime context.')
assert(runtimeBranchSync.includes("'set_staff_runtime_context'"), 'OS runtime branch client is missing.')
assert(appSource.includes('fallbackOperationalBranch'), 'Login does not safely establish an operational branch when no schedule exists.')
assert(homeSource.includes('await setRuntimeBranchContext'), 'Interactive branch switching does not update server runtime context first.')
assert(staffSettingsRuntime.includes("'operational_branch_changed'"), 'Runtime branch overrides are not durably auditable.')

assert(staffSettingsRuntime.includes('private.enabled_staff_roles'), 'Staff invite/profile sync does not honor Owner-enabled roles.')
assert(staffSettingsRuntime.includes('public.can_invite_staff_role'), 'Trusted staff invite authorization helper is missing.')
assert(staffSettingsRuntime.includes('public.sync_staff_access_profile'), 'Staff access-profile synchronization RPC is missing.')
assert(staffLifecycleSync.includes("functions.invoke('staff-admin'"), 'OS does not call the trusted staff provisioning function.')
assert(staffLifecycleSync.includes("'sync_staff_access_profile'"), 'OS does not synchronize staff profile changes.')
assert(staffAdminFunction.includes('auth.admin.createUser') || staffAdminFunction.includes('inviteUserByEmail'), 'Staff provisioning function does not create Supabase Auth users.')
assert(staffAdminFunction.includes('SUPABASE_SECRET_KEYS'), 'Staff provisioning function is not using server-only secret credentials.')
assert(staffAdminFunction.includes("rpc('can_invite_staff_role'"), 'Staff provisioning function does not verify database authority.')
assert(staffAdminFunction.includes("from('staff_access_profiles')"), 'Staff provisioning function does not link Auth users to staff access profiles.')
assert(loginSource.includes("type=(?:recovery|invite)"), 'Login does not handle invited staff password setup links.')
assert(loginSource.includes('updateSupabasePassword'), 'Invited staff cannot establish their password.')
assert(staffLoginFunction.includes('signInWithPassword'), 'Username login function does not delegate credential verification to Supabase Auth.')
assert(releaseWorkflow.includes('functions deploy staff-admin'), 'Production release does not deploy the staff provisioning Edge Function.')
assert(releaseWorkflow.includes('functions deploy staff-login'), 'Production release does not deploy the username login Edge Function.')

assert(staffSettingsRuntime.includes('PAYROLL_PAYMENT_REQUIRES_EXACTLY_ONE_PROPOSAL'), 'Payroll payment does not enforce one proposal per payment command.')
assert(staffSettingsRuntime.includes("return private.apply_payroll_workflow_state('record_payment'"), 'Exact payroll payment wrapper does not delegate to the authoritative workflow transaction.')

console.log('Fleurstales V3.3 Supabase staff identity, Settings, runtime-branch, authorization, workflow, audit, notification, and concurrency contract passes.')
