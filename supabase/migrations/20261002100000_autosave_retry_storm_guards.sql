-- Autosave writers must report revision conflicts to the browser exactly once.
--
-- PostgREST retries SQLSTATE 40001 inside the server (see 20260906064632 and the
-- 2026-09-30/10-01 Catalog incident, 20260921020000). These seven writers are called by
-- Business OS autosave paths (operational and finance domains, Store details, permissions,
-- internal settings, customers) and raise 40001 on a stale revision, so one stale
-- request became many server-side executions.
--
-- Following the *_guarded convention:
--   1. Current clients call *_guarded wrappers (SupabaseHttpClient GUARDED_RPC_NAMES).
--   2. Wrappers convert 40001 to PT409 (HTTP 409, never retried) and keep the original
--      message, so client conflict detection (REVISION_CONFLICT:*, STORE_CONFLICT,
--      CUSTOMER_CONFLICT) is unchanged.
--   3. The inner names are closed to browser roles so stale tabs fail fast with 42501.
-- Inner writers and their authorization checks are unchanged.
set local lock_timeout = '5s';

create or replace function public.save_operational_domain_state_guarded(
  p_domain text,
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_operational_domain_state(p_domain => p_domain, p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest operational state before saving again.';
end;
$$;

create or replace function public.save_finance_operational_state_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_finance_operational_state(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest finance state before saving again.';
end;
$$;

create or replace function public.replace_public_store_snapshot_guarded(
  p_base_revision bigint,
  p_profile jsonb,
  p_branches jsonb,
  p_payment_accounts jsonb,
  p_payment_instructions text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.replace_public_store_snapshot(p_base_revision => p_base_revision, p_profile => p_profile, p_branches => p_branches, p_payment_accounts => p_payment_accounts, p_payment_instructions => p_payment_instructions);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest Store details before saving again.';
end;
$$;

create or replace function public.save_authorization_config_guarded(
  p_expected_revision bigint,
  p_sections jsonb,
  p_actions jsonb,
  p_features jsonb DEFAULT '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_authorization_config(p_expected_revision => p_expected_revision, p_sections => p_sections, p_actions => p_actions, p_features => p_features);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest permissions before saving again.';
end;
$$;

create or replace function public.save_internal_settings_config_guarded(
  p_expected_revision bigint,
  p_staff_roles jsonb,
  p_attendance jsonb,
  p_scheduling jsonb,
  p_payroll jsonb,
  p_customer_segments jsonb,
  p_scheduling_revisions jsonb,
  p_payroll_revisions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_internal_settings_config(p_expected_revision => p_expected_revision, p_staff_roles => p_staff_roles, p_attendance => p_attendance, p_scheduling => p_scheduling, p_payroll => p_payroll, p_customer_segments => p_customer_segments, p_scheduling_revisions => p_scheduling_revisions, p_payroll_revisions => p_payroll_revisions);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest settings before saving again.';
end;
$$;

create or replace function public.save_customer_profile_guarded(
  p_customer jsonb,
  p_base_revision bigint DEFAULT NULL::bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_customer_profile(p_customer => p_customer, p_base_revision => p_base_revision);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest customer before saving again.';
end;
$$;

create or replace function public.delete_customer_profile_guarded(
  p_customer_id text,
  p_base_revision bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.delete_customer_profile(p_customer_id => p_customer_id, p_base_revision => p_base_revision);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest customer before deleting again.';
end;
$$;

revoke all on function public.save_operational_domain_state_guarded(text,bigint,jsonb) from public, anon;
grant execute on function public.save_operational_domain_state_guarded(text,bigint,jsonb) to authenticated, service_role;
revoke all on function public.save_finance_operational_state_guarded(bigint,jsonb) from public, anon;
grant execute on function public.save_finance_operational_state_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.replace_public_store_snapshot_guarded(bigint,jsonb,jsonb,jsonb,text) from public, anon;
grant execute on function public.replace_public_store_snapshot_guarded(bigint,jsonb,jsonb,jsonb,text) to authenticated, service_role;
revoke all on function public.save_authorization_config_guarded(bigint,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_authorization_config_guarded(bigint,jsonb,jsonb,jsonb) to authenticated, service_role;
revoke all on function public.save_internal_settings_config_guarded(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_internal_settings_config_guarded(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated, service_role;
revoke all on function public.save_customer_profile_guarded(jsonb,bigint) from public, anon;
grant execute on function public.save_customer_profile_guarded(jsonb,bigint) to authenticated, service_role;
revoke all on function public.delete_customer_profile_guarded(text,bigint) from public, anon;
grant execute on function public.delete_customer_profile_guarded(text,bigint) to authenticated, service_role;

revoke execute on function public.save_operational_domain_state(text,bigint,jsonb) from authenticated, anon;
revoke execute on function public.save_finance_operational_state(bigint,jsonb) from authenticated, anon;
revoke execute on function public.replace_public_store_snapshot(bigint,jsonb,jsonb,jsonb,text) from authenticated, anon;
revoke execute on function public.save_authorization_config(bigint,jsonb,jsonb,jsonb) from authenticated, anon;
revoke execute on function public.save_internal_settings_config(bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from authenticated, anon;
revoke execute on function public.save_customer_profile(jsonb,bigint) from authenticated, anon;
revoke execute on function public.delete_customer_profile(text,bigint) from authenticated, anon;

-- HR and Order writers already have guarded wrappers (20260906064632) and the client has
-- called only the wrappers since then. Close the retired names like the Catalog writers.
revoke execute on function public.save_hr_operational_state(bigint,jsonb) from authenticated, anon;
revoke execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) from authenticated, anon;

-- Supabase's default privileges grant EXECUTE on every new public function to anon.
-- `revoke ... from public` does not remove that explicit grant (see 20261001100000), so
-- new SECURITY DEFINER functions were anonymous entrypoints unless a migration revoked
-- anon by name. Stop the automatic anon grant; functions meant for anonymous Storefront
-- visitors must grant anon explicitly. Existing grants are unchanged. New functions still
-- get PostgreSQL's built-in PUBLIC grant, so migrations keep `revoke ... from public`
-- (every current public function does); autosave_guarded_rpc_smoke.sql fails if any
-- SECURITY DEFINER function outside the Storefront allowlist becomes anon-executable.
alter default privileges for role postgres in schema public revoke execute on functions from anon;

notify pgrst, 'reload schema';
