-- Revision-conflict CPU guard contract.
-- Stale clients must be rejected before expensive HR projection work and
-- before Order writers wait on their authoritative row lock. The inner writers
-- still retain their original locked revision checks for race safety.

do $$
declare
  v_source text;
  v_preflight integer;
  v_writer integer;
begin
  if not has_function_privilege(
       'authenticated',
       'public.save_hr_operational_state(bigint,jsonb)',
       'EXECUTE'
     ) or has_function_privilege(
       'anon',
       'public.save_hr_operational_state(bigint,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'HR operational save grants changed unexpectedly';
  end if;

  select pg_get_functiondef('public.save_hr_operational_state(bigint,jsonb)'::regprocedure)
  into v_source;
  v_preflight := position('select revision, snapshot, updated_at' in lower(v_source));
  v_writer := position('v_result := public.save_hr_operational_state_unchecked' in lower(v_source));
  if v_preflight = 0 or v_writer = 0 or v_preflight >= v_writer then
    raise exception 'HR stale-revision preflight no longer runs before the expensive HR writer';
  end if;
  if position('REVISION_CONFLICT:hr' in v_source)=0 then
    raise exception 'HR stale-revision fast-fail lost its optimistic concurrency error';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)',
       'EXECUTE'
     ) or has_function_privilege(
       'anon',
       'public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Order operational save grants changed unexpectedly';
  end if;

  select pg_get_functiondef(
    'public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_source;
  v_preflight := position('select branch_id, revision' in lower(v_source));
  v_writer := position('v_result := public.save_order_operational_state_unchecked' in lower(v_source));
  if v_preflight = 0 or v_writer = 0 or v_preflight >= v_writer then
    raise exception 'Order stale-revision preflight no longer runs before the locked Order writer';
  end if;
  if position('current_staff_branch_id' in v_source)=0
     or position('ORDER_OUTSIDE_BRANCH_SCOPE' in v_source)=0 then
    raise exception 'Order fast-fail wrapper lost the Admin runtime-branch boundary';
  end if;
  if position('REVISION_CONFLICT:order' in v_source)=0 then
    raise exception 'Order stale-revision fast-fail lost its optimistic concurrency error';
  end if;
end $$;
