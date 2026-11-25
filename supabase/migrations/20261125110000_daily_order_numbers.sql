-- Daily order numbers (Owner decision 25 Nov 2026).
--
-- <BRANCH CODE>-YY-MM-DD-NNN, e.g. KDM-26-11-26-001. Each branch has its own
-- sequence per Jakarta day, starting at 001. The last 3 digits are the QRIS
-- unique code. Past 999 orders in a day the number simply grows (…-1000).
-- Old yearly numbers (KDM-2026-0026) stay valid; public.order_sequences is
-- kept for history and no longer advanced.

begin;

create table if not exists public.order_daily_sequences (
  branch_id text not null references public.branches(id) on update cascade on delete cascade,
  sequence_date date not null,
  last_sequence integer not null check (last_sequence > 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, sequence_date)
);

alter table public.order_daily_sequences enable row level security;
revoke all on table public.order_daily_sequences from anon, authenticated;
grant select on public.order_daily_sequences to authenticated;
drop policy if exists order_daily_sequences_staff_read on public.order_daily_sequences;
create policy order_daily_sequences_staff_read on public.order_daily_sequences
for select to authenticated
using (private.has_staff_role(array['owner','admin','finance']));

create or replace function private.allocate_order_number(
  p_branch_id text,
  p_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_date date;
  v_sequence integer;
begin
  select * into v_branch from public.branches where id = p_branch_id for share;
  if not found then
    raise exception 'Selected branch is unavailable.' using errcode = '22023';
  end if;
  v_date := timezone('Asia/Jakarta', p_at)::date;
  insert into public.order_daily_sequences(branch_id, sequence_date, last_sequence, updated_at)
  values (v_branch.id, v_date, 1, now())
  on conflict (branch_id, sequence_date)
  do update set last_sequence = public.order_daily_sequences.last_sequence + 1, updated_at = now()
  returning last_sequence into v_sequence;
  return upper(v_branch.code) || '-' || to_char(v_date, 'YY-MM-DD') || '-'
    || case when v_sequence < 1000 then lpad(v_sequence::text, 3, '0') else v_sequence::text end;
end;
$$;
revoke execute on function private.allocate_order_number(text, timestamptz) from public, anon, authenticated;

commit;
