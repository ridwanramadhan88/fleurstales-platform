create table if not exists public.operational_state (
  id text primary key default 'primary',
  revision bigint not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.operational_state enable row level security;
grant select, insert, update on public.operational_state to authenticated;

create policy operational_state_staff_select on public.operational_state
  for select to authenticated
  using (private.has_staff_role(array['owner','admin','finance','hr','florist']));

create policy operational_state_staff_insert on public.operational_state
  for insert to authenticated
  with check (private.has_staff_role(array['owner','admin','finance','hr','florist']));

create policy operational_state_staff_update on public.operational_state
  for update to authenticated
  using (private.has_staff_role(array['owner','admin','finance','hr','florist']))
  with check (private.has_staff_role(array['owner','admin','finance','hr','florist']));
