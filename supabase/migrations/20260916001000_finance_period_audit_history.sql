-- Finance v3.4: expose accounting-period action history through a read-only RPC.
-- The underlying audit table remains private from direct client access.

begin;

create or replace function public.get_finance_period_actions(p_months_back integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer := greatest(1,least(coalesce(p_months_back,6),24));
  v_current_month date := date_trunc('month',timezone('Asia/Jakarta',clock_timestamp()))::date;
  v_first_month date := (v_current_month - make_interval(months=>v_count-1))::date;
  v_result jsonb;
begin
  if (select auth.uid()) is null or not private.has_section_access('finance','view') then
    raise exception 'FINANCE_VIEW_REQUIRED' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', action_row.id,
        'periodMonth', to_char(action_row.period_month,'YYYY-MM-DD'),
        'action', action_row.action,
        'fromStatus', action_row.from_status,
        'toStatus', action_row.to_status,
        'actorEmployeeId', action_row.actor_employee_id,
        'actorName', action_row.actor_name,
        'actorRole', action_row.actor_role,
        'reason', action_row.reason,
        'createdAt', action_row.created_at
      )
      order by action_row.created_at desc, action_row.id desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.finance_period_actions action_row
  where action_row.period_month between v_first_month and v_current_month;

  return v_result;
end;
$$;

revoke execute on function public.get_finance_period_actions(integer) from public, anon;
grant execute on function public.get_finance_period_actions(integer) to authenticated, service_role;

commit;
