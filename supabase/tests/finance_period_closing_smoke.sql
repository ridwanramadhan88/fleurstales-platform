-- Finance v3 accounting-period smoke checks.

begin;

do $$
begin
  if not exists (
    select 1 from private.action_capability_registry
    where capability='finance.close_period'
      and allowed_roles=array['finance']::text[]
  ) then
    raise exception 'finance.close_period capability is not registered correctly';
  end if;

  if not exists (
    select 1 from private.role_action_permissions
    where role='finance' and capability='finance.close_period' and enabled=true
  ) then
    raise exception 'Finance close-period permission is not enabled by default';
  end if;

  if not exists (
    select 1 from private.role_action_permissions
    where role='finance' and capability='finance.reopen_period' and enabled=false
  ) then
    raise exception 'Finance reopen-period permission must default to disabled';
  end if;
end $$;

insert into public.finance_periods(period_month,status,closed_reason)
values ('2020-01-01','closed','Smoke-test closed period')
on conflict (period_month) do update set status='closed', closed_reason=excluded.closed_reason;

insert into private.operational_domain_state(domain,revision,snapshot,updated_at)
values ('finance',1,'{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb,now())
on conflict (domain) do nothing;

do $$
begin
  begin
    update private.operational_domain_state
    set snapshot=jsonb_set(
      snapshot,
      '{transactions}',
      jsonb_build_array(jsonb_build_object(
        'id','smoke-closed-period',
        'type','income',
        'status','verified',
        'amount',1000,
        'accountId','cash:main',
        'source','manual',
        'entryMode','manual',
        'transactionDate','2020-01-15T00:00:00+07:00'
      )) || coalesce(snapshot->'transactions','[]'::jsonb),
      true
    )
    where domain='finance';

    raise exception 'EXPECTED_CLOSED_PERIOD_GUARD';
  exception when others then
    if sqlerrm='EXPECTED_CLOSED_PERIOD_GUARD' then raise; end if;
    if sqlerrm not like 'FINANCE_PERIOD_CLOSED%' then raise; end if;
  end;
end $$;

rollback;
