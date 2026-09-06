-- PostgREST 14.5 retries SQLSTATE 40001 inside the server, even after the
-- browser times out. Business revision conflicts must reach the client once.
-- Preserve the original message and all inner authorization/rollback checks.
set local lock_timeout = '2s';
set local statement_timeout = '10s';
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
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest HR state before saving again.';
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
    p_order_id, p_expected_revision, p_next_revision,
    p_state, p_items, p_payment_events
  );
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest order before saving again.';
end;
$$;

-- CREATE OR REPLACE preserves the existing authenticated/service_role grants.
-- Do not change the underlying writers or business permission boundaries.
notify pgrst, 'reload schema';
