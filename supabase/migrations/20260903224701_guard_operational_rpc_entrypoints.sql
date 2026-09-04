-- Protect production from stale browser clients repeatedly retrying revision-conflicted writes.
-- Current clients use the guarded entrypoints; the retired RPC names remain available only
-- to service_role so already-open stale authenticated tabs fail before mutation logic runs.

create or replace function public.save_hr_operational_state_guarded(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_hr_operational_state(p_expected_revision, p_snapshot);
end;
$$;

create or replace function public.save_order_operational_state_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_next_revision integer,
  p_state jsonb,
  p_items jsonb,
  p_payment_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_order_operational_state(
    p_order_id,
    p_expected_revision,
    p_next_revision,
    p_state,
    p_items,
    p_payment_events
  );
end;
$$;

revoke all on function public.save_hr_operational_state_guarded(bigint,jsonb) from public, anon;
revoke all on function public.save_order_operational_state_guarded(text,integer,integer,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_hr_operational_state_guarded(bigint,jsonb) to authenticated, service_role;
grant execute on function public.save_order_operational_state_guarded(text,integer,integer,jsonb,jsonb,jsonb) to authenticated, service_role;

revoke execute on function public.save_hr_operational_state(bigint,jsonb) from authenticated;
revoke execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) from authenticated;

notify pgrst, 'reload schema';
