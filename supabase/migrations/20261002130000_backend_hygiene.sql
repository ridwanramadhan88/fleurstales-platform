-- Backend hygiene after the 2026-09-30/10-01 retry storm.
--
-- 1. Row level security on the two remaining public tables without it. Browser roles have
--    no grants on them and the SECURITY DEFINER finance functions run as the owner, which
--    bypasses RLS, so behaviour is unchanged; this is defence in depth if a grant is ever
--    added by mistake.
-- 2. Compact private.audit_events. The storm left its heap at ~17 MB for ~1.5 MB of rows.
--    VACUUM FULL cannot run inside a migration transaction; CLUSTER ... USING rewrites the
--    table the same way and can. It holds an exclusive lock for well under a second on a
--    table this size; lock_timeout makes the migration fail cleanly instead of queueing.
-- 3. Refresh planner statistics. 42 of 54 public/private tables had never been analyzed,
--    because low write volume never crosses the autoanalyze threshold.
set local lock_timeout = '5s';

alter table public.finance_periods enable row level security;
alter table public.finance_period_actions enable row level security;

cluster private.audit_events using audit_events_pkey;

do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as tbl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private')
      and c.relkind = 'r'
      and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('analyze %s', r.tbl);
  end loop;
end;
$$;
