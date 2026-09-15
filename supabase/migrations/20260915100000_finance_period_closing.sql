-- Finance v3: accounting periods and closed-period ledger protection.
--
-- Periods are monthly in Asia/Jakarta. Open/Review are operational states;
-- Closed freezes every Finance ledger row in that month. Reopening is a
-- separate, normally-disabled capability and always requires an audit reason.

begin;

create table if not exists public.finance_periods (
  period_month date primary key,
  status text not null default 'open' check (status in ('open','review','closed')),
  revision bigint not null default 1 check (revision >= 1),
  closed_at timestamptz,
  closed_by text,
  closed_reason text,
  reopened_at timestamptz,
  reopened_by text,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_period_month_start check (period_month = date_trunc('month', period_month)::date)
);

create table if not exists public.finance_period_actions (
  id uuid primary key default gen_random_uuid(),
  period_month date not null references public.finance_periods(period_month) on delete restrict,
  action text not null check (action in ('start_review','return_open','close','reopen')),
  from_status text not null check (from_status in ('open','review','closed')),
  to_status text not null check (to_status in ('open','review','closed')),
  actor_employee_id text,
  actor_name text not null,
  actor_role text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists finance_period_actions_period_created_idx
  on public.finance_period_actions(period_month, created_at desc);

revoke all on table public.finance_periods from public, anon, authenticated;
revoke all on table public.finance_period_actions from public, anon, authenticated;

-- Explicit Finance capabilities. Closing is enabled for Finance by default;
-- reopening is intentionally off until Owner grants it from Permissions.
insert into private.action_capability_registry(
  capability, parent_section, requires_edit, allowed_roles
) values
  ('finance.close_period','finance',true,array['finance']::text[]),
  ('finance.reopen_period','finance',true,array['finance']::text[])
on conflict (capability) do update
set parent_section=excluded.parent_section,
    requires_edit=excluded.requires_edit,
    allowed_roles=excluded.allowed_roles;

insert into private.role_action_permissions(role, capability, enabled) values
  ('finance','finance.close_period',true),
  ('finance','finance.reopen_period',false)
on conflict (role, capability) do nothing;

create or replace function private.finance_period_month_from_text(p_value text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value text := nullif(trim(coalesce(p_value,'')),'');
begin
  if v_value is null then return null; end if;
  begin
    if v_value ~ '^\d{4}-\d{2}-\d{2}$' then
      return date_trunc('month', v_value::date)::date;
    end if;
    return date_trunc('month', timezone('Asia/Jakarta', v_value::timestamptz))::date;
  exception when others then
    return null;
  end;
end;
$$;

create or replace function private.finance_transaction_period_month(p_transaction jsonb)
returns date
language sql
immutable
set search_path = ''
as $$
  select private.finance_period_month_from_text(
    coalesce(nullif(p_transaction->>'transactionDate',''), nullif(p_transaction->>'createdAt',''))
  )
$$;

create or replace function private.finance_period_is_closed(p_period_month date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.finance_periods p
    where p.period_month=date_trunc('month',p_period_month)::date
      and p.status='closed'
  )
$$;

create or replace function private.finance_period_blockers(p_period_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month',p_period_month)::date;
  v_reconciliation integer := 0;
  v_refunds integer := 0;
  v_payroll integer := 0;
  v_legacy integer := 0;
  v_pending integer := 0;
begin
  select count(distinct e.order_id)::integer
  into v_reconciliation
  from public.order_payment_events e
  join public.orders o on o.id=e.order_id
  where e.type='payment_received'
    and e.amount_idr>0
    and date_trunc('month',timezone('Asia/Jakarta',e.occurred_at))::date=v_month
    and not o.finance_verified;

  select count(*)::integer
  into v_refunds
  from public.orders o
  where o.payment_status='refund_pending'
    and o.refund_initiated_at is not null
    and date_trunc('month',timezone('Asia/Jakarta',o.refund_initiated_at))::date=v_month;

  select count(*)::integer
  into v_payroll
  from private.operational_domain_state s
  cross join lateral jsonb_array_elements(coalesce(s.snapshot->'payrollProposals','[]'::jsonb)) proposal
  where s.domain='payroll'
    and coalesce(proposal->>'status','draft') not in ('paid','resolved')
    and exists(
      select 1
      from jsonb_array_elements(coalesce(s.snapshot->'periods','[]'::jsonb)) payroll_period
      where payroll_period->>'id'=proposal->>'payrollPeriodId'
        and private.finance_period_month_from_text(payroll_period->>'periodEnd')=v_month
    );

  select count(*)::integer
  into v_legacy
  from private.operational_domain_state s
  cross join lateral jsonb_array_elements(coalesce(s.snapshot->'transactions','[]'::jsonb)) tx
  where s.domain='finance'
    and coalesce(tx->>'status','')='verified'
    and private.finance_transaction_period_month(tx)=v_month
    and (nullif(tx->>'accountId','') is null or tx->>'accountId'='legacy:unassigned');

  select count(*)::integer
  into v_pending
  from private.operational_domain_state s
  cross join lateral jsonb_array_elements(coalesce(s.snapshot->'transactions','[]'::jsonb)) tx
  where s.domain='finance'
    and coalesce(tx->>'status','')<>'verified'
    and private.finance_transaction_period_month(tx)=v_month;

  return jsonb_build_object(
    'reconciliation',coalesce(v_reconciliation,0),
    'refunds',coalesce(v_refunds,0),
    'payroll',coalesce(v_payroll,0),
    'legacyAccounts',coalesce(v_legacy,0),
    'pendingTransactions',coalesce(v_pending,0)
  );
end;
$$;

create or replace function private.finance_period_summary(p_period_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month',p_period_month)::date;
  v_period public.finance_periods%rowtype;
  v_blockers jsonb;
  v_total integer;
begin
  select * into v_period
  from public.finance_periods
  where period_month=v_month;

  v_blockers := private.finance_period_blockers(v_month);
  v_total := coalesce((v_blockers->>'reconciliation')::integer,0)
    + coalesce((v_blockers->>'refunds')::integer,0)
    + coalesce((v_blockers->>'payroll')::integer,0)
    + coalesce((v_blockers->>'legacyAccounts')::integer,0)
    + coalesce((v_blockers->>'pendingTransactions')::integer,0);

  return jsonb_strip_nulls(jsonb_build_object(
    'periodMonth',to_char(v_month,'YYYY-MM-DD'),
    'status',coalesce(v_period.status,'open'),
    'revision',coalesce(v_period.revision,0),
    'blockers',v_blockers,
    'blockerTotal',v_total,
    'closedAt',v_period.closed_at,
    'closedBy',v_period.closed_by,
    'closedReason',v_period.closed_reason,
    'reopenedAt',v_period.reopened_at,
    'reopenedBy',v_period.reopened_by,
    'reopenReason',v_period.reopen_reason,
    'updatedAt',v_period.updated_at
  ));
end;
$$;

create or replace function public.get_finance_periods(p_months_back integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count integer := greatest(1,least(coalesce(p_months_back,6),24));
  v_current_month date := date_trunc('month',timezone('Asia/Jakarta',clock_timestamp()))::date;
  v_result jsonb;
begin
  if (select auth.uid()) is null or not private.has_section_access('finance','view') then
    raise exception 'FINANCE_VIEW_REQUIRED' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(private.finance_period_summary(month_value) order by month_value desc),'[]'::jsonb)
  into v_result
  from (
    select (v_current_month - make_interval(months=>g))::date as month_value
    from generate_series(0,v_count-1) g
  ) months;

  return v_result;
end;
$$;

revoke execute on function public.get_finance_periods(integer) from public, anon;
grant execute on function public.get_finance_periods(integer) to authenticated, service_role;

create or replace function public.set_finance_period_status(
  p_period_month date,
  p_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month',p_period_month)::date;
  v_current_month date := date_trunc('month',timezone('Asia/Jakarta',clock_timestamp()))::date;
  v_target text := lower(trim(coalesce(p_status,'')));
  v_reason text := nullif(trim(coalesce(p_reason,'')),'');
  v_old_status text := 'open';
  v_period public.finance_periods%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_blockers jsonb;
  v_blocker_total integer := 0;
  v_action text;
begin
  if (select auth.uid()) is null or private.current_staff_role()<>'finance' then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if v_target not in ('open','review','closed') then
    raise exception 'FINANCE_PERIOD_STATUS_INVALID' using errcode='22023';
  end if;
  if v_month>v_current_month then
    raise exception 'FINANCE_PERIOD_FUTURE_NOT_ALLOWED' using errcode='22023';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id=(select auth.uid()) and is_active=true
  limit 1;
  if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;

  select * into v_period
  from public.finance_periods
  where period_month=v_month
  for update;
  if found then v_old_status := v_period.status; end if;

  if v_old_status=v_target then
    return private.finance_period_summary(v_month);
  end if;

  if v_old_status='closed' then
    if v_target<>'open' then
      raise exception 'FINANCE_PERIOD_TRANSITION_INVALID' using errcode='22023';
    end if;
    if not private.has_action_permission('finance.reopen_period') then
      raise exception 'FINANCE_REOPEN_PERIOD_NOT_PERMITTED' using errcode='42501';
    end if;
    if v_reason is null or length(v_reason)<3 then
      raise exception 'FINANCE_REOPEN_REASON_REQUIRED' using errcode='22023';
    end if;
    v_action := 'reopen';
  else
    if not private.has_action_permission('finance.close_period') then
      raise exception 'FINANCE_CLOSE_PERIOD_NOT_PERMITTED' using errcode='42501';
    end if;
    if v_old_status='open' and v_target<>'review' then
      raise exception 'FINANCE_PERIOD_REVIEW_REQUIRED' using errcode='22023';
    end if;
    if v_old_status='review' and v_target not in ('open','closed') then
      raise exception 'FINANCE_PERIOD_TRANSITION_INVALID' using errcode='22023';
    end if;

    if v_target='closed' then
      if v_month>=v_current_month then
        raise exception 'FINANCE_PERIOD_NOT_ENDED' using errcode='22023';
      end if;
      if v_reason is null or length(v_reason)<3 then
        raise exception 'FINANCE_CLOSE_REASON_REQUIRED' using errcode='22023';
      end if;
      v_blockers := private.finance_period_blockers(v_month);
      v_blocker_total := coalesce((v_blockers->>'reconciliation')::integer,0)
        + coalesce((v_blockers->>'refunds')::integer,0)
        + coalesce((v_blockers->>'payroll')::integer,0)
        + coalesce((v_blockers->>'legacyAccounts')::integer,0)
        + coalesce((v_blockers->>'pendingTransactions')::integer,0);
      if v_blocker_total>0 then
        raise exception 'FINANCE_PERIOD_HAS_BLOCKERS %',v_blockers using errcode='22023';
      end if;
      v_action := 'close';
    elsif v_target='review' then
      v_action := 'start_review';
    else
      v_action := 'return_open';
    end if;
  end if;

  insert into public.finance_periods as fp(
    period_month,status,revision,closed_at,closed_by,closed_reason,
    reopened_at,reopened_by,reopen_reason,created_at,updated_at
  ) values (
    v_month,v_target,1,
    case when v_target='closed' then clock_timestamp() else null end,
    case when v_target='closed' then coalesce(nullif(trim(v_profile.display_name),''),v_profile.role) else null end,
    case when v_target='closed' then v_reason else null end,
    case when v_old_status='closed' and v_target='open' then clock_timestamp() else null end,
    case when v_old_status='closed' and v_target='open' then coalesce(nullif(trim(v_profile.display_name),''),v_profile.role) else null end,
    case when v_old_status='closed' and v_target='open' then v_reason else null end,
    clock_timestamp(),clock_timestamp()
  )
  on conflict (period_month) do update
  set status=excluded.status,
      revision=fp.revision+1,
      closed_at=case when excluded.status='closed' then clock_timestamp() else fp.closed_at end,
      closed_by=case when excluded.status='closed' then coalesce(nullif(trim(v_profile.display_name),''),v_profile.role) else fp.closed_by end,
      closed_reason=case when excluded.status='closed' then v_reason else fp.closed_reason end,
      reopened_at=case when fp.status='closed' and excluded.status='open' then clock_timestamp() else fp.reopened_at end,
      reopened_by=case when fp.status='closed' and excluded.status='open' then coalesce(nullif(trim(v_profile.display_name),''),v_profile.role) else fp.reopened_by end,
      reopen_reason=case when fp.status='closed' and excluded.status='open' then v_reason else fp.reopen_reason end,
      updated_at=clock_timestamp();

  insert into public.finance_period_actions(
    period_month,action,from_status,to_status,actor_employee_id,actor_name,actor_role,reason
  ) values (
    v_month,v_action,v_old_status,v_target,v_profile.employee_id,
    coalesce(nullif(trim(v_profile.display_name),''),v_profile.role),v_profile.role,v_reason
  );

  return private.finance_period_summary(v_month);
end;
$$;

revoke execute on function public.set_finance_period_status(date,text,text) from public, anon;
grant execute on function public.set_finance_period_status(date,text,text) to authenticated, service_role;

-- Freeze ledger rows in Closed periods centrally. Every Finance mutation already
-- writes through the authoritative finance snapshot, so this one trigger covers
-- manual entries, balance utilities, order/refund projections and payroll rows.
create or replace function private.guard_closed_finance_period_transactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_tx jsonb;
  v_old_tx jsonb;
  v_month date;
begin
  if new.domain<>'finance' then return new; end if;

  for v_new_tx in
    select value from jsonb_array_elements(coalesce(new.snapshot->'transactions','[]'::jsonb))
  loop
    v_old_tx := null;
    select value into v_old_tx
    from jsonb_array_elements(coalesce(old.snapshot->'transactions','[]'::jsonb))
    where value->>'id'=v_new_tx->>'id'
    limit 1;

    if v_old_tx is null or v_old_tx is distinct from v_new_tx then
      v_month := private.finance_transaction_period_month(v_new_tx);
      if v_month is not null and private.finance_period_is_closed(v_month) then
        raise exception 'FINANCE_PERIOD_CLOSED month=% transaction=%',v_month,coalesce(v_new_tx->>'id','unknown') using errcode='55000';
      end if;
    end if;
  end loop;

  for v_old_tx in
    select value from jsonb_array_elements(coalesce(old.snapshot->'transactions','[]'::jsonb))
  loop
    if not exists(
      select 1
      from jsonb_array_elements(coalesce(new.snapshot->'transactions','[]'::jsonb)) next_tx
      where next_tx->>'id'=v_old_tx->>'id'
    ) then
      v_month := private.finance_transaction_period_month(v_old_tx);
      if v_month is not null and private.finance_period_is_closed(v_month) then
        raise exception 'FINANCE_PERIOD_CLOSED month=% transaction=%',v_month,coalesce(v_old_tx->>'id','unknown') using errcode='55000';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function private.guard_closed_finance_period_transactions() from public, anon, authenticated;

drop trigger if exists guard_closed_finance_period_transactions on private.operational_domain_state;
create trigger guard_closed_finance_period_transactions
before update on private.operational_domain_state
for each row
when (old.domain='finance' or new.domain='finance')
execute function private.guard_closed_finance_period_transactions();

commit;
