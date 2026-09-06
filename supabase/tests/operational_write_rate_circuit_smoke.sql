-- Accepted-write feedback-loop guard contract.
-- Full database replay must keep both conflict and accepted-write circuits intact.
--
-- The existing conflict breaker protects stale-revision loops. These assertions
-- keep the second line of defense intact for technically valid/current-revision
-- loops and preserve the table-level no-op UPDATE kill switch.

do $$
declare
  v_hr text;
  v_order text;
  v_rate text;
  v_skip text;
  v_revision_guard integer;
  v_rate_guard integer;
  v_writer integer;
begin
  if to_regclass('private.mutation_rate_circuits') is null then
    raise exception 'mutation_rate_circuits table missing';
  end if;

  if has_table_privilege('authenticated','private.mutation_rate_circuits','SELECT')
     or has_table_privilege('authenticated','private.mutation_rate_circuits','INSERT')
     or has_table_privilege('authenticated','private.mutation_rate_circuits','UPDATE') then
    raise exception 'authenticated users gained direct access to mutation rate circuits';
  end if;

  if has_function_privilege(
       'authenticated',
       'private.consume_mutation_rate_budget(text,integer,integer,integer)',
       'EXECUTE'
     ) then
    raise exception 'mutation rate helper became directly executable by authenticated users';
  end if;

  select lower(pg_get_functiondef(
    'private.consume_mutation_rate_budget(text,integer,integer,integer)'::regprocedure
  )) into v_rate;
  if position('blocked_until > v_now' in v_rate)=0
     or position('c.accepted_count + 1 > p_limit' in v_rate)=0 then
    raise exception 'mutation rate circuit lost its cheap blocked path or threshold logic';
  end if;

  select lower(pg_get_functiondef('private.skip_identical_row_update()'::regprocedure))
  into v_skip;
  if position('new is not distinct from old' in v_skip)=0
     or position('return null' in v_skip)=0 then
    raise exception 'identical-row UPDATE trigger helper changed unexpectedly';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    where t.tgrelid='public.employee_point_events'::regclass
      and not t.tgisinternal
      and t.tgname='employee_point_events_skip_identical_update'
      and (t.tgtype & 2) = 2   -- BEFORE
      and (t.tgtype & 16) = 16 -- UPDATE
  ) then
    raise exception 'employee_point_events identical UPDATE kill switch missing';
  end if;

  select lower(pg_get_functiondef('public.save_hr_operational_state(bigint,jsonb)'::regprocedure))
  into v_hr;
  v_revision_guard := position('if p_expected_revision is null or v_current_revision <> p_expected_revision then' in v_hr);
  v_rate_guard := position('private.consume_mutation_rate_budget(v_scope, 15, 5, 60)' in v_hr);
  v_writer := position('v_result := public.save_hr_operational_state_unchecked' in v_hr);
  if v_revision_guard=0 or v_rate_guard=0 or v_writer=0
     or not (v_revision_guard < v_rate_guard and v_rate_guard < v_writer) then
    raise exception 'HR accepted-write circuit no longer runs after revision validation and before expensive writer';
  end if;
  if position('mutation_rate_circuit_open:hr' in v_hr)=0 then
    raise exception 'HR accepted-write circuit lost its explicit error';
  end if;

  select lower(pg_get_functiondef(
    'public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)'::regprocedure
  )) into v_order;
  v_revision_guard := position('if p_expected_revision is null or v_actual_revision <> p_expected_revision then' in v_order);
  v_rate_guard := position('private.consume_mutation_rate_budget(v_scope, 25, 5, 60)' in v_order);
  v_writer := position('v_result := public.save_order_operational_state_unchecked' in v_order);
  if v_revision_guard=0 or v_rate_guard=0 or v_writer=0
     or not (v_revision_guard < v_rate_guard and v_rate_guard < v_writer) then
    raise exception 'Order accepted-write circuit no longer runs after revision validation and before expensive writer';
  end if;
  if position('mutation_rate_circuit_open:order' in v_order)=0 then
    raise exception 'Order accepted-write circuit lost its explicit error';
  end if;
end $$;
