-- Payroll generation must follow historical employment overlap instead of the
-- employee's current active/inactive status. This prevents a staff member who
-- leaves before payroll is prepared from disappearing from their final cycle.
begin;

create or replace function private.assert_payroll_employment_coverage(p_snapshot jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous jsonb := '{}'::jsonb;
  v_hr jsonb := '{}'::jsonb;
  v_changed_period_ids text[] := array[]::text[];
  v_period_id text;
  v_period jsonb;
  v_period_start text;
  v_period_end text;
  v_expected_employee_ids text[] := array[]::text[];
  v_generated_employee_ids text[] := array[]::text[];
begin
  select coalesce(snapshot, '{}'::jsonb)
    into v_previous
  from private.operational_domain_state
  where domain = 'payroll';

  select coalesce(snapshot, '{}'::jsonb)
    into v_hr
  from private.operational_domain_state
  where domain = 'hr';

  select coalesce(array_agg(distinct changed.period_id order by changed.period_id), array[]::text[])
    into v_changed_period_ids
  from (
    select coalesce(n.item->>'payrollPeriodId', o.item->>'payrollPeriodId') as period_id
    from (
      select item
      from jsonb_array_elements(coalesce(v_previous->'employeePayrolls', '[]'::jsonb)) item
      where coalesce(item->>'entryMode', 'generated') <> 'manual'
    ) o
    full join (
      select item
      from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls', '[]'::jsonb)) item
      where coalesce(item->>'entryMode', 'generated') <> 'manual'
    ) n on n.item->>'id' = o.item->>'id'
    where n.item is distinct from o.item
  ) changed
  where nullif(changed.period_id, '') is not null;

  -- A generation command normally changes exactly one period. A true no-op is
  -- harmless; multi-period mutation is rejected because it cannot be tied to a
  -- single HR preparation action.
  if coalesce(array_length(v_changed_period_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(v_changed_period_ids, 1) <> 1 then
    raise exception 'PAYROLL_GENERATE_MULTI_PERIOD_NOT_ALLOWED' using errcode = '22023';
  end if;

  v_period_id := v_changed_period_ids[1];
  select item
    into v_period
  from jsonb_array_elements(coalesce(p_snapshot->'periods', '[]'::jsonb)) item
  where item->>'id' = v_period_id
  limit 1;

  if v_period is null then
    raise exception 'PAYROLL_PERIOD_NOT_FOUND' using errcode = '22023';
  end if;

  v_period_start := v_period->>'periodStart';
  v_period_end := v_period->>'periodEnd';
  if coalesce(v_period_start, '') !~ '^\d{4}-\d{2}-\d{2}$'
     or coalesce(v_period_end, '') !~ '^\d{4}-\d{2}-\d{2}$'
     or v_period_start > v_period_end then
    raise exception 'INVALID_PAYROLL_PERIOD' using errcode = '22023';
  end if;

  select coalesce(array_agg(e->>'id' order by e->>'id'), array[]::text[])
    into v_expected_employee_ids
  from jsonb_array_elements(coalesce(v_hr->'employees', '[]'::jsonb)) e
  where coalesce(e->>'systemRole', '') <> 'owner'
    and coalesce(e->>'hireDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and e->>'hireDate' <= v_period_end
    and (
      case
        when nullif(e->>'employmentEndDate', '') is not null then
          (e->>'employmentEndDate') ~ '^\d{4}-\d{2}-\d{2}$'
          and e->>'employmentEndDate' >= v_period_start
        else coalesce(e->>'status', '') = 'active'
      end
    );

  select coalesce(array_agg(d->>'employeeId' order by d->>'employeeId'), array[]::text[])
    into v_generated_employee_ids
  from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls', '[]'::jsonb)) d
  where d->>'payrollPeriodId' = v_period_id
    and coalesce(d->>'entryMode', 'generated') <> 'manual';

  if v_generated_employee_ids is distinct from v_expected_employee_ids then
    raise exception 'PAYROLL_EMPLOYMENT_COVERAGE_MISMATCH' using
      errcode = '22023',
      detail = format(
        'period=%s expected=%s generated=%s',
        v_period_id,
        array_to_string(v_expected_employee_ids, ','),
        array_to_string(v_generated_employee_ids, ',')
      );
  end if;
end;
$$;

revoke execute on function private.assert_payroll_employment_coverage(jsonb) from public, anon, authenticated;

create or replace function public.payroll_generate(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_payroll_employment_coverage(p_snapshot);
  return private.apply_payroll_workflow_state('generate', p_expected_revision, p_snapshot);
end;
$$;

revoke execute on function public.payroll_generate(bigint,jsonb) from public, anon;
grant execute on function public.payroll_generate(bigint,jsonb) to authenticated;

commit;