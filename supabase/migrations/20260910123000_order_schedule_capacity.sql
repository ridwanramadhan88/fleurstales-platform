-- Shared pickup/delivery scheduling guard.
-- One branch may accept at most three active orders in an exact 15-minute slot.
-- New orders must also stay strictly more than 45 minutes ahead of Jakarta time.

create index if not exists idx_orders_active_schedule_slot
  on public.orders (branch_id, schedule_date, schedule_time)
  where status in ('pending_verification', 'confirmed', 'processing', 'ready', 'delivering');

create or replace function public.get_unavailable_order_slots(
  p_branch_id text,
  p_schedule_date date
)
returns table(schedule_time time without time zone)
language sql
stable
security definer
set search_path = ''
as $$
  select o.schedule_time
  from public.orders o
  where o.branch_id = p_branch_id
    and o.schedule_date = p_schedule_date
    and o.schedule_time is not null
    and o.status in ('pending_verification', 'confirmed', 'processing', 'ready', 'delivering')
  group by o.schedule_time
  having count(*) >= 3
  order by o.schedule_time;
$$;

revoke all on function public.get_unavailable_order_slots(text, date) from public;
grant execute on function public.get_unavailable_order_slots(text, date) to anon, authenticated, service_role;

create or replace function private.enforce_order_schedule_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
  v_old_active boolean := false;
  v_slot_count integer;
  v_lock_key bigint;
begin
  v_active := new.status in ('pending_verification', 'confirmed', 'processing', 'ready', 'delivering');

  if not v_active then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_active := old.status in ('pending_verification', 'confirmed', 'processing', 'ready', 'delivering');
    if v_old_active
      and new.branch_id is not distinct from old.branch_id
      and new.schedule_date is not distinct from old.schedule_date
      and new.schedule_time is not distinct from old.schedule_time then
      return new;
    end if;
  end if;

  -- Preserve compatibility with any legacy unscheduled rows. Current creation
  -- flows require a schedule, and only scheduled rows participate in capacity.
  if new.schedule_date is null or new.schedule_time is null then
    return new;
  end if;

  if mod(extract(minute from new.schedule_time)::integer, 15) <> 0
    or extract(second from new.schedule_time) <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_SLOT_INTERVAL_INVALID';
  end if;

  if (new.schedule_date + new.schedule_time)
      <= (pg_catalog.timezone('Asia/Jakarta', pg_catalog.now()) + interval '45 minutes') then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_SLOT_TOO_SOON';
  end if;

  -- Serialize competing inserts/edits for the same branch/date/time. Without
  -- this lock, two simultaneous checkouts could both observe only two orders
  -- and incorrectly create a fourth slot occupant.
  v_lock_key := pg_catalog.hashtextextended(
    new.branch_id || '|' || new.schedule_date::text || '|' || new.schedule_time::text,
    0
  );
  perform pg_catalog.pg_advisory_xact_lock(v_lock_key);

  select count(*)::integer
    into v_slot_count
  from public.orders o
  where o.branch_id = new.branch_id
    and o.schedule_date = new.schedule_date
    and o.schedule_time = new.schedule_time
    and o.status in ('pending_verification', 'confirmed', 'processing', 'ready', 'delivering')
    and o.id <> new.id;

  if v_slot_count >= 3 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_SLOT_FULL';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_schedule_capacity_guard on public.orders;
create trigger orders_schedule_capacity_guard
before insert or update of branch_id, schedule_date, schedule_time, status
on public.orders
for each row execute function private.enforce_order_schedule_capacity();
