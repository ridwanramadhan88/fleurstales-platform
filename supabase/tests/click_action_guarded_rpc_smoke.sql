-- Click-driven Order/Finance/Payroll/Review writers: browser roles reach them only through
-- *_guarded wrappers that turn PostgREST-retried 40001 into a single PT409 (HTTP 409).
do $$
declare
  v_pair text[];
  v_pairs text[][] := array[
    array['attach_order_finish_photo', 'text,integer,text,text'],
    array['cancel_pending_storefront_order', 'text,integer,text'],
    array['complete_order_refund_with_account', 'text,integer,text'],
    array['confirm_order_payment_for_processing', 'text,integer,text'],
    array['confirm_order_payment_with_proof', 'text,integer,text,text'],
    array['confirm_pending_storefront_order', 'text,integer'],
    array['create_finance_cashflow_entry', 'bigint,text,text,bigint,text,text,timestamp with time zone,text,bigint'],
    array['decide_order_finance_reconciliation', 'text,integer,text,text'],
    array['edit_manual_finance_transaction', 'bigint,text,jsonb,text'],
    array['record_payroll_payment_with_account', 'bigint,text,date,text,text,text,bigint,text'],
    array['save_manual_finance_transaction', 'bigint,jsonb,bigint,text,text'],
    array['save_order_finance_reference', 'text,integer,text'],
    array['start_paid_order_production', 'text,integer,text,date,time without time zone,boolean,text,time without time zone,time without time zone'],
    array['create_internal_order', 'jsonb'],
    array['save_review_reward_settings', 'boolean,numeric,bigint,bigint'],
    array['payroll_set_compensation', 'bigint,jsonb'],
    array['payroll_prepare', 'bigint,jsonb'],
    array['payroll_generate', 'bigint,jsonb'],
    array['payroll_submit', 'bigint,jsonb'],
    array['payroll_resolve_rejected', 'bigint,jsonb'],
    array['payroll_approve_employee', 'bigint,jsonb'],
    array['payroll_reject_employee', 'bigint,jsonb'],
    array['payroll_approve_all', 'bigint,jsonb'],
    array['payroll_record_payment', 'bigint,jsonb'],
    array['payroll_adjust_schedule', 'bigint,jsonb']
  ];
  v_inner text;
  v_guarded text;
  v_source text;
begin
  foreach v_pair slice 1 in array v_pairs loop
    v_inner := format('public.%s(%s)', v_pair[1], v_pair[2]);
    v_guarded := format('public.%s_guarded(%s)', v_pair[1], v_pair[2]);

    if to_regprocedure(v_guarded) is null then
      raise exception 'Guarded click-action writer is missing: %', v_guarded;
    end if;
    if not has_function_privilege('authenticated', v_guarded, 'EXECUTE')
       or has_function_privilege('anon', v_guarded, 'EXECUTE') then
      raise exception 'Guarded click-action writer grants are incorrect: %', v_guarded;
    end if;
    if has_function_privilege('authenticated', v_inner, 'EXECUTE')
       or has_function_privilege('anon', v_inner, 'EXECUTE') then
      raise exception 'Retired click-action writer is executable by browser roles again: %', v_inner;
    end if;

    select pg_get_functiondef(v_guarded::regprocedure) into v_source;
    if position('serialization_failure' in v_source) = 0 or position('PT409' in v_source) = 0 then
      raise exception 'Guarded click-action writer no longer converts 40001 to PT409: %', v_guarded;
    end if;
  end loop;
end;
$$;

-- Behaviour: transaction-local stand-ins raise 40001; ROLLBACK restores the real writers.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

create or replace function public.payroll_submit(p_expected_revision bigint, p_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_expected_revision = -1 then
    raise exception 'REVISION_CONFLICT:payroll:expected=-1:actual=1' using errcode = '40001';
  elsif p_expected_revision = -2 then
    raise exception 'FINANCE_PAYROLL_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;
  return p_snapshot;
end;
$fn$;

create or replace function public.create_internal_order(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $fn$
begin
  if p_payload ? 'staleQuote' then
    raise exception 'ORDER_QUOTE_CHANGED' using errcode = '40001';
  end if;
  return p_payload;
end;
$fn$;

set local role authenticated;
do $test$
declare
  v_snapshot jsonb := '{"unchanged":true}'::jsonb;
begin
  if public.payroll_submit_guarded(1, v_snapshot) is distinct from v_snapshot then
    raise exception 'Guarded payroll command changed the success response';
  end if;
  begin
    perform public.payroll_submit_guarded(-1, '{}');
    raise exception 'Stale payroll command was accepted';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'REVISION_CONFLICT:payroll:expected=-1:actual=1' then raise; end if;
  end;
  begin
    perform public.payroll_submit_guarded(-2, '{}');
    raise exception 'Payroll authorization failure was swallowed';
  exception when insufficient_privilege then
    if sqlerrm <> 'FINANCE_PAYROLL_COMMAND_FORBIDDEN' then raise; end if;
  end;

  if public.create_internal_order_guarded('{"ok":true}') is distinct from '{"ok":true}'::jsonb then
    raise exception 'Guarded internal order changed the success response';
  end if;
  begin
    perform public.create_internal_order_guarded('{"staleQuote":true}');
    raise exception 'Changed internal-order quote was accepted';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'ORDER_QUOTE_CHANGED' then raise; end if;
  end;
end;
$test$;
rollback;
