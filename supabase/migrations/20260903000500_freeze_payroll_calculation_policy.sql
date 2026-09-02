-- Freeze payroll calculation rules at the database authority boundary.
-- Existing historical rows may remain without a policy, but every new HR
-- submission/resubmission must carry one consistent policy across the proposal
-- and all generated employee payroll rows. Finance cannot mutate this policy
-- because it is part of the HR-owned payroll projection.
begin;

create or replace function private.payroll_hr_owned_projection(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'compensations', coalesce(p_snapshot->'compensations','[]'::jsonb),
    'employeePayrolls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e->>'id',
        'payrollPeriodId', e->'payrollPeriodId',
        'employeeId', e->'employeeId',
        'employeeName', e->'employeeName',
        'employeeRole', e->'employeeRole',
        'entryMode', e->'entryMode',
        'manualPayeeType', e->'manualPayeeType',
        'manualReason', e->'manualReason',
        'compensationId', e->'compensationId',
        'baseSalaryIdr', e->'baseSalaryIdr',
        'positivePoints', e->'positivePoints',
        'negativePoints', e->'negativePoints',
        'netPoints', e->'netPoints',
        'bonusIdr', e->'bonusIdr',
        'finalPayrollIdr', e->'finalPayrollIdr',
        'hrAdjustmentIdr', e->'hrAdjustmentIdr',
        'hrAdjustmentReason', e->'hrAdjustmentReason',
        'pointEntries', e->'pointEntries',
        'calculationPolicy', e->'calculationPolicy',
        'generatedAt', e->'generatedAt',
        'generatedBy', e->'generatedBy',
        'submittedAt', e->'submittedAt',
        'submittedBy', e->'submittedBy'
      ) order by e->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) e
    ), '[]'::jsonb),
    'payrollProposals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p->>'id',
        'payrollPeriodId', p->'payrollPeriodId',
        'employeePayrollIds', p->'employeePayrollIds',
        'totalBaseSalaryIdr', p->'totalBaseSalaryIdr',
        'totalBonusIdr', p->'totalBonusIdr',
        'totalAdjustmentsIdr', p->'totalAdjustmentsIdr',
        'totalPayrollIdr', p->'totalPayrollIdr',
        'calculationPolicy', p->'calculationPolicy',
        'createdAt', p->'createdAt',
        'createdBy', p->'createdBy',
        'submittedAt', p->'submittedAt',
        'submittedBy', p->'submittedBy',
        'warnings', p->'warnings'
      ) order by p->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'payrollProposals','[]'::jsonb)) p
    ), '[]'::jsonb),
    'resolvedReviews', coalesce((
      select jsonb_agg(r order by r->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'payrollReviews','[]'::jsonb)) r
      where coalesce(r->>'decision','') = 'resolved'
    ), '[]'::jsonb)
  )
$$;
revoke execute on function private.payroll_hr_owned_projection(jsonb) from public, anon, authenticated;

create or replace function private.payroll_calculation_policy_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal jsonb;
  v_policy jsonb;
begin
  if new.domain <> 'payroll' then return new; end if;

  -- Validate only a new submission transition. Historical proposals that were
  -- already under Finance review before this migration remain readable.
  for v_proposal in
    select proposal
    from jsonb_array_elements(coalesce(new.snapshot->'payrollProposals','[]'::jsonb)) proposal
    where proposal->>'status' = 'submitted_to_finance'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(old.snapshot->'payrollProposals','[]'::jsonb)) previous
        where previous->>'id' = proposal->>'id'
          and previous->>'status' = 'submitted_to_finance'
      )
  loop
    v_policy := v_proposal->'calculationPolicy';

    -- Validate textual integer shape before any casts so malformed JSON can
    -- never surface as a PostgreSQL cast error instead of a domain error.
    if jsonb_typeof(v_policy) <> 'object'
      or coalesce(v_policy->>'pointValueIdr','') !~ '^[0-9]+$'
      or coalesce(v_policy->>'bonusCapIdr','') !~ '^[0-9]+$'
    then
      raise exception 'INVALID_PAYROLL_CALCULATION_POLICY' using errcode = '22023';
    end if;

    if (v_policy->>'pointValueIdr')::numeric <= 0 then
      raise exception 'INVALID_PAYROLL_CALCULATION_POLICY' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(coalesce(new.snapshot->'employeePayrolls','[]'::jsonb)) employee_payroll
      where employee_payroll->>'id' in (
        select jsonb_array_elements_text(coalesce(v_proposal->'employeePayrollIds','[]'::jsonb))
      )
        and coalesce(employee_payroll->>'status','draft') <> 'resolved'
        and coalesce(employee_payroll->>'entryMode','generated') <> 'manual'
        and employee_payroll->'calculationPolicy' is distinct from v_policy
    ) then
      raise exception 'PAYROLL_CALCULATION_POLICY_MISMATCH' using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;
revoke execute on function private.payroll_calculation_policy_guard() from public, anon, authenticated;

drop trigger if exists payroll_calculation_policy_guard on private.operational_domain_state;
create trigger payroll_calculation_policy_guard
before update of snapshot on private.operational_domain_state
for each row execute function private.payroll_calculation_policy_guard();

commit;
