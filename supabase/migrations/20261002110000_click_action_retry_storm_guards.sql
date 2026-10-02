-- Click-driven writers must report revision and quote conflicts to the browser once.
--
-- Follow-up to 20261002100000 (autosave writers). These Order, Finance, Payroll and
-- Review-settings actions raise SQLSTATE 40001 on a stale revision or a changed quote,
-- either directly or through private.apply_payroll_workflow_state /
-- create_internal_order_pre_cashflow / save_review_reward_settings_cashflow_internal.
-- PostgREST retries 40001 inside the server, so one stale click became many executions.
--
-- Same *_guarded convention: wrappers convert 40001 to PT409 (HTTP 409, never retried)
-- and keep the original message (REVISION_CONFLICT:*, ORDER_QUOTE_CHANGED, ...); the
-- client calls the wrappers through GUARDED_RPC_NAMES; the inner names are closed to
-- browser roles. Inner writers and their authorization checks are unchanged.
-- The anonymous checkout (create_storefront_order) is intentionally not wrapped: its
-- only 40001 is a transient customer-identity race where a server retry is useful.
set local lock_timeout = '5s';

create or replace function public.attach_order_finish_photo_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_finish_photo_url text,
  p_uploaded_by text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.attach_order_finish_photo(p_order_id => p_order_id, p_expected_revision => p_expected_revision, p_finish_photo_url => p_finish_photo_url, p_uploaded_by => p_uploaded_by);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before trying again.';
end;
$$;

create or replace function public.cancel_pending_storefront_order_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.cancel_pending_storefront_order(p_order_id => p_order_id, p_expected_revision => p_expected_revision, p_reason => p_reason);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before trying again.';
end;
$$;

create or replace function public.complete_order_refund_with_account_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.complete_order_refund_with_account(p_order_id => p_order_id, p_expected_revision => p_expected_revision, p_finance_account_id => p_finance_account_id);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before trying again.';
end;
$$;

create or replace function public.confirm_order_payment_for_processing_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.confirm_order_payment_for_processing(p_order_id => p_order_id, p_expected_revision => p_expected_revision, p_finance_account_id => p_finance_account_id);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before trying again.';
end;
$$;

create or replace function public.confirm_order_payment_with_proof_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text,
  p_payment_proof_path text DEFAULT NULL::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.confirm_order_payment_with_proof(p_order_id => p_order_id, p_expected_revision => p_expected_revision, p_finance_account_id => p_finance_account_id, p_payment_proof_path => p_payment_proof_path);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before trying again.';
end;
$$;

create or replace function public.confirm_pending_storefront_order_guarded(
  p_order_id text,
  p_expected_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.confirm_pending_storefront_order(p_order_id => p_order_id, p_expected_revision => p_expected_revision);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before trying again.';
end;
$$;

create or replace function public.create_finance_cashflow_entry_guarded(
  p_expected_revision bigint,
  p_kind text,
  p_account_id text,
  p_amount bigint,
  p_direction text DEFAULT NULL::text,
  p_counterparty_account_id text DEFAULT NULL::text,
  p_transaction_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_note text DEFAULT NULL::text,
  p_transfer_fee bigint DEFAULT 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.create_finance_cashflow_entry(p_expected_revision => p_expected_revision, p_kind => p_kind, p_account_id => p_account_id, p_amount => p_amount, p_direction => p_direction, p_counterparty_account_id => p_counterparty_account_id, p_transaction_date => p_transaction_date, p_note => p_note, p_transfer_fee => p_transfer_fee);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest finance data before trying again.';
end;
$$;

create or replace function public.decide_order_finance_reconciliation_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_decision text,
  p_note text DEFAULT NULL::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.decide_order_finance_reconciliation(p_order_id => p_order_id, p_expected_revision => p_expected_revision, p_decision => p_decision, p_note => p_note);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before trying again.';
end;
$$;

create or replace function public.edit_manual_finance_transaction_guarded(
  p_expected_revision bigint,
  p_transaction_id text,
  p_patch jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.edit_manual_finance_transaction(p_expected_revision => p_expected_revision, p_transaction_id => p_transaction_id, p_patch => p_patch, p_reason => p_reason);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest finance data before trying again.';
end;
$$;

create or replace function public.record_payroll_payment_with_account_guarded(
  p_expected_revision bigint,
  p_payroll_proposal_id text,
  p_payment_date date,
  p_payment_method text,
  p_payment_reference text,
  p_finance_account_id text,
  p_transfer_fee bigint DEFAULT 0,
  p_note text DEFAULT NULL::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.record_payroll_payment_with_account(p_expected_revision => p_expected_revision, p_payroll_proposal_id => p_payroll_proposal_id, p_payment_date => p_payment_date, p_payment_method => p_payment_method, p_payment_reference => p_payment_reference, p_finance_account_id => p_finance_account_id, p_transfer_fee => p_transfer_fee, p_note => p_note);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.save_manual_finance_transaction_guarded(
  p_expected_revision bigint,
  p_payload jsonb,
  p_transfer_fee bigint DEFAULT 0,
  p_transaction_id text DEFAULT NULL::text,
  p_edit_reason text DEFAULT NULL::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_manual_finance_transaction(p_expected_revision => p_expected_revision, p_payload => p_payload, p_transfer_fee => p_transfer_fee, p_transaction_id => p_transaction_id, p_edit_reason => p_edit_reason);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest finance data before trying again.';
end;
$$;

create or replace function public.save_order_finance_reference_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_order_finance_reference(p_order_id => p_order_id, p_expected_revision => p_expected_revision, p_reference => p_reference);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before trying again.';
end;
$$;

create or replace function public.start_paid_order_production_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_florist_employee_id text,
  p_assignment_date date,
  p_assignment_time time without time zone DEFAULT NULL::time without time zone,
  p_allow_schedule_override boolean DEFAULT false,
  p_scheduled_branch_id text DEFAULT NULL::text,
  p_shift_start time without time zone DEFAULT NULL::time without time zone,
  p_shift_end time without time zone DEFAULT NULL::time without time zone
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.start_paid_order_production(p_order_id => p_order_id, p_expected_revision => p_expected_revision, p_florist_employee_id => p_florist_employee_id, p_assignment_date => p_assignment_date, p_assignment_time => p_assignment_time, p_allow_schedule_override => p_allow_schedule_override, p_scheduled_branch_id => p_scheduled_branch_id, p_shift_start => p_shift_start, p_shift_end => p_shift_end);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before trying again.';
end;
$$;

create or replace function public.create_internal_order_guarded(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.create_internal_order(p_payload => p_payload);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Review the updated order quote before submitting again.';
end;
$$;

create or replace function public.save_review_reward_settings_guarded(
  p_enabled boolean,
  p_percent_off numeric,
  p_min_order_idr bigint,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_review_reward_settings(p_enabled => p_enabled, p_percent_off => p_percent_off, p_min_order_idr => p_min_order_idr, p_expected_revision => p_expected_revision);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest review reward settings before saving again.';
end;
$$;

create or replace function public.payroll_set_compensation_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_set_compensation(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.payroll_prepare_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_prepare(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.payroll_generate_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_generate(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.payroll_submit_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_submit(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.payroll_resolve_rejected_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_resolve_rejected(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.payroll_approve_employee_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_approve_employee(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.payroll_reject_employee_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_reject_employee(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.payroll_approve_all_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_approve_all(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.payroll_record_payment_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_record_payment(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

create or replace function public.payroll_adjust_schedule_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.payroll_adjust_schedule(p_expected_revision => p_expected_revision, p_snapshot => p_snapshot);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest payroll before trying again.';
end;
$$;

revoke all on function public.attach_order_finish_photo_guarded(text,integer,text,text) from public, anon;
grant execute on function public.attach_order_finish_photo_guarded(text,integer,text,text) to authenticated, service_role;
revoke all on function public.cancel_pending_storefront_order_guarded(text,integer,text) from public, anon;
grant execute on function public.cancel_pending_storefront_order_guarded(text,integer,text) to authenticated, service_role;
revoke all on function public.complete_order_refund_with_account_guarded(text,integer,text) from public, anon;
grant execute on function public.complete_order_refund_with_account_guarded(text,integer,text) to authenticated, service_role;
revoke all on function public.confirm_order_payment_for_processing_guarded(text,integer,text) from public, anon;
grant execute on function public.confirm_order_payment_for_processing_guarded(text,integer,text) to authenticated, service_role;
revoke all on function public.confirm_order_payment_with_proof_guarded(text,integer,text,text) from public, anon;
grant execute on function public.confirm_order_payment_with_proof_guarded(text,integer,text,text) to authenticated, service_role;
revoke all on function public.confirm_pending_storefront_order_guarded(text,integer) from public, anon;
grant execute on function public.confirm_pending_storefront_order_guarded(text,integer) to authenticated, service_role;
revoke all on function public.create_finance_cashflow_entry_guarded(bigint,text,text,bigint,text,text,timestamp with time zone,text,bigint) from public, anon;
grant execute on function public.create_finance_cashflow_entry_guarded(bigint,text,text,bigint,text,text,timestamp with time zone,text,bigint) to authenticated, service_role;
revoke all on function public.decide_order_finance_reconciliation_guarded(text,integer,text,text) from public, anon;
grant execute on function public.decide_order_finance_reconciliation_guarded(text,integer,text,text) to authenticated, service_role;
revoke all on function public.edit_manual_finance_transaction_guarded(bigint,text,jsonb,text) from public, anon;
grant execute on function public.edit_manual_finance_transaction_guarded(bigint,text,jsonb,text) to authenticated, service_role;
revoke all on function public.record_payroll_payment_with_account_guarded(bigint,text,date,text,text,text,bigint,text) from public, anon;
grant execute on function public.record_payroll_payment_with_account_guarded(bigint,text,date,text,text,text,bigint,text) to authenticated, service_role;
revoke all on function public.save_manual_finance_transaction_guarded(bigint,jsonb,bigint,text,text) from public, anon;
grant execute on function public.save_manual_finance_transaction_guarded(bigint,jsonb,bigint,text,text) to authenticated, service_role;
revoke all on function public.save_order_finance_reference_guarded(text,integer,text) from public, anon;
grant execute on function public.save_order_finance_reference_guarded(text,integer,text) to authenticated, service_role;
revoke all on function public.start_paid_order_production_guarded(text,integer,text,date,time without time zone,boolean,text,time without time zone,time without time zone) from public, anon;
grant execute on function public.start_paid_order_production_guarded(text,integer,text,date,time without time zone,boolean,text,time without time zone,time without time zone) to authenticated, service_role;
revoke all on function public.create_internal_order_guarded(jsonb) from public, anon;
grant execute on function public.create_internal_order_guarded(jsonb) to authenticated, service_role;
revoke all on function public.save_review_reward_settings_guarded(boolean,numeric,bigint,bigint) from public, anon;
grant execute on function public.save_review_reward_settings_guarded(boolean,numeric,bigint,bigint) to authenticated, service_role;
revoke all on function public.payroll_set_compensation_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_set_compensation_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.payroll_prepare_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_prepare_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.payroll_generate_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_generate_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.payroll_submit_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_submit_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.payroll_resolve_rejected_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_resolve_rejected_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.payroll_approve_employee_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_approve_employee_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.payroll_reject_employee_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_reject_employee_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.payroll_approve_all_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_approve_all_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.payroll_record_payment_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_record_payment_guarded(bigint,jsonb) to authenticated, service_role;
revoke all on function public.payroll_adjust_schedule_guarded(bigint,jsonb) from public, anon;
grant execute on function public.payroll_adjust_schedule_guarded(bigint,jsonb) to authenticated, service_role;

revoke execute on function public.attach_order_finish_photo(text,integer,text,text) from authenticated, anon;
revoke execute on function public.cancel_pending_storefront_order(text,integer,text) from authenticated, anon;
revoke execute on function public.complete_order_refund_with_account(text,integer,text) from authenticated, anon;
revoke execute on function public.confirm_order_payment_for_processing(text,integer,text) from authenticated, anon;
revoke execute on function public.confirm_order_payment_with_proof(text,integer,text,text) from authenticated, anon;
revoke execute on function public.confirm_pending_storefront_order(text,integer) from authenticated, anon;
revoke execute on function public.create_finance_cashflow_entry(bigint,text,text,bigint,text,text,timestamp with time zone,text,bigint) from authenticated, anon;
revoke execute on function public.decide_order_finance_reconciliation(text,integer,text,text) from authenticated, anon;
revoke execute on function public.edit_manual_finance_transaction(bigint,text,jsonb,text) from authenticated, anon;
revoke execute on function public.record_payroll_payment_with_account(bigint,text,date,text,text,text,bigint,text) from authenticated, anon;
revoke execute on function public.save_manual_finance_transaction(bigint,jsonb,bigint,text,text) from authenticated, anon;
revoke execute on function public.save_order_finance_reference(text,integer,text) from authenticated, anon;
revoke execute on function public.start_paid_order_production(text,integer,text,date,time without time zone,boolean,text,time without time zone,time without time zone) from authenticated, anon;
revoke execute on function public.create_internal_order(jsonb) from authenticated, anon;
revoke execute on function public.save_review_reward_settings(boolean,numeric,bigint,bigint) from authenticated, anon;
revoke execute on function public.payroll_set_compensation(bigint,jsonb) from authenticated, anon;
revoke execute on function public.payroll_prepare(bigint,jsonb) from authenticated, anon;
revoke execute on function public.payroll_generate(bigint,jsonb) from authenticated, anon;
revoke execute on function public.payroll_submit(bigint,jsonb) from authenticated, anon;
revoke execute on function public.payroll_resolve_rejected(bigint,jsonb) from authenticated, anon;
revoke execute on function public.payroll_approve_employee(bigint,jsonb) from authenticated, anon;
revoke execute on function public.payroll_reject_employee(bigint,jsonb) from authenticated, anon;
revoke execute on function public.payroll_approve_all(bigint,jsonb) from authenticated, anon;
revoke execute on function public.payroll_record_payment(bigint,jsonb) from authenticated, anon;
revoke execute on function public.payroll_adjust_schedule(bigint,jsonb) from authenticated, anon;

notify pgrst, 'reload schema';
