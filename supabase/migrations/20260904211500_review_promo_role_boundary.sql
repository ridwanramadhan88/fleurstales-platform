-- Keep review template/reward configuration in the commercial Admin/Owner
-- surface. Finance receives no review/promo configuration authority.

begin;

alter function public.get_review_configuration()
  rename to get_review_configuration_cashflow_internal;
revoke execute on function public.get_review_configuration_cashflow_internal()
  from public, anon, authenticated;

create or replace function public.get_review_configuration()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_staff_role() not in ('owner','admin') then
    raise exception 'REVIEW_SETTINGS_NOT_PERMITTED' using errcode='42501';
  end if;
  return public.get_review_configuration_cashflow_internal();
end;
$$;
revoke execute on function public.get_review_configuration() from public, anon;
grant execute on function public.get_review_configuration() to authenticated, service_role;

alter function public.save_review_reward_settings(boolean,numeric,bigint,bigint)
  rename to save_review_reward_settings_cashflow_internal;
revoke execute on function public.save_review_reward_settings_cashflow_internal(boolean,numeric,bigint,bigint)
  from public, anon, authenticated;

create or replace function public.save_review_reward_settings(
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
  if (select auth.uid()) is null or private.current_staff_role() not in ('owner','admin') then
    raise exception 'PROMO_SETTINGS_NOT_PERMITTED' using errcode='42501';
  end if;
  return public.save_review_reward_settings_cashflow_internal(
    p_enabled,
    p_percent_off,
    p_min_order_idr,
    p_expected_revision
  );
end;
$$;
revoke execute on function public.save_review_reward_settings(boolean,numeric,bigint,bigint) from public, anon;
grant execute on function public.save_review_reward_settings(boolean,numeric,bigint,bigint) to authenticated, service_role;

commit;
