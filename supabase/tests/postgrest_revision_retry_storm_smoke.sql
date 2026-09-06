-- Isolate wrapper behavior using transaction-local replacements of the inner
-- writers. ROLLBACK restores the real implementations; no business data is used.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

create or replace function public.save_hr_operational_state(
  p_expected_revision bigint, p_snapshot jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if p_expected_revision = -1 then
    raise exception 'REVISION_CONFLICT:hr:expected=-1:actual=1' using errcode='40001';
  elsif p_expected_revision = -2 then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  return p_snapshot;
end;
$$;

create or replace function public.save_order_operational_state(
  p_order_id text, p_expected_revision integer, p_next_revision integer,
  p_state jsonb, p_items jsonb default '[]'::jsonb,
  p_payment_events jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if p_expected_revision = -1 then
    raise exception 'REVISION_CONFLICT:order:test:expected=-1:actual=1' using errcode='40001';
  elsif p_expected_revision = -2 then
    raise exception 'ORDER_OUTSIDE_BRANCH_SCOPE' using errcode='42501';
  end if;
  return p_state;
end;
$$;

set local role authenticated;
do $test$
declare
  v_response jsonb := '{"revision":2,"snapshot":{"unchanged":true}}'::jsonb;
begin
  if public.save_hr_operational_state_guarded(1,v_response) is distinct from v_response then
    raise exception 'HR success response changed';
  end if;
  if public.save_order_operational_state_guarded('test',1,2,v_response,'[]','[]')
     is distinct from v_response then
    raise exception 'Order success response changed';
  end if;
  begin
    perform public.save_hr_operational_state_guarded(-1,'{}');
    raise exception 'Stale HR save was accepted';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'REVISION_CONFLICT:hr:expected=-1:actual=1' then raise; end if;
  end;
  begin
    perform public.save_order_operational_state_guarded('test',-1,0,'{}','[]','[]');
    raise exception 'Stale order save was accepted';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'REVISION_CONFLICT:order:test:expected=-1:actual=1' then raise; end if;
  end;
  begin
    perform public.save_hr_operational_state_guarded(-2,'{}');
    raise exception 'HR authorization failure was swallowed';
  exception when insufficient_privilege then
    if sqlerrm <> 'AUTH_REQUIRED' then raise; end if;
  end;
  begin
    perform public.save_order_operational_state_guarded('test',-2,0,'{}','[]','[]');
    raise exception 'Order branch rejection was swallowed';
  exception when insufficient_privilege then
    if sqlerrm <> 'ORDER_OUTSIDE_BRANCH_SCOPE' then raise; end if;
  end;
  if has_function_privilege('anon','public.save_hr_operational_state_guarded(bigint,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.save_order_operational_state_guarded(text,integer,integer,jsonb,jsonb,jsonb)','EXECUTE') then
    raise exception 'Anonymous users can execute guarded writers';
  end if;
end;
$test$;
rollback;
