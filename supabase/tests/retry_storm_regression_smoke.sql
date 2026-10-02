-- Regression guard for the 2026-09-30/10-01 retry storm.
--
-- PostgREST retries SQLSTATE 40001 inside the server, so a browser-callable RPC that can
-- raise it turns one stale request into many executions. Every such RPC must be a
-- *_guarded wrapper that converts serialization_failure into PT409 (HTTP 409).
--
-- This walks the call graph: start from every public/private function that raises 40001,
-- add every function that calls one of them without converting the error, and fail if any
-- function in that set is executable by anon or authenticated.
do $$
declare
  v_offenders text;
begin
  with recursive raisers(oid) as (
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosrc ~* '(errcode\s*=?\s*''(40001|serialization_failure)''|sqlstate\s+''40001'')'
      and not (p.prosrc ~* 'when\s+serialization_failure' and p.prosrc ~* 'PT409')
    union
    select c.oid
    from raisers r
    join pg_proc rp on rp.oid = r.oid
    join pg_namespace rn on rn.oid = rp.pronamespace
    join pg_proc c on c.prosrc ~ ('\m' || rn.nspname || '\.' || rp.proname || '\s*\(')
    join pg_namespace cn on cn.oid = c.pronamespace
    where cn.nspname in ('public', 'private')
      and not (c.prosrc ~* 'when\s+serialization_failure' and c.prosrc ~* 'PT409')
  )
  select string_agg(distinct p.oid::regprocedure::text, ', ')
  into v_offenders
  from raisers r
  join pg_proc p on p.oid = r.oid
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    -- Anonymous checkout: its only 40001 is a transient customer-identity race where a
    -- server-side retry is useful, not a stale revision.
    and p.proname not in ('create_storefront_order');

  if v_offenders is not null then
    raise exception 'Browser-callable RPCs can raise 40001 without a PT409 guard (PostgREST retry storm risk): %', v_offenders;
  end if;
end;
$$;
