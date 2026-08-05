-- Add HR-controlled manual payroll payees and explicitly support audited
-- Finance approval of any HR-submitted payroll row, including Finance's own.
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

create or replace function private.payroll_manual_payee_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous jsonb := case when tg_op='UPDATE' then coalesce(old.snapshot,'{}'::jsonb) else '{}'::jsonb end;
  v_next jsonb := coalesce(new.snapshot,'{}'::jsonb);
  v_role text := private.current_staff_role();
begin
  if new.domain <> 'payroll' then return new; end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_next->'employeePayrolls','[]'::jsonb)) e
    where coalesce(e->>'entryMode','generated')='manual'
      and (
        coalesce(e->>'manualPayeeType','') not in ('owner','part_time','contractor','other')
        or length(trim(coalesce(e->>'employeeName',''))) < 2
        or coalesce(e->>'employeeId','') !~ '^manual-payee:'
        or coalesce(e->>'manualReason','') !~ '\S{3}'
        or coalesce(e->>'baseSalaryIdr','') !~ '^[0-9]+$'
        or (e->>'baseSalaryIdr')::bigint <= 0
        or coalesce((e->>'positivePoints')::integer,0) <> 0
        or coalesce((e->>'negativePoints')::integer,0) <> 0
        or coalesce((e->>'netPoints')::integer,0) <> 0
        or coalesce((e->>'bonusIdr')::bigint,0) <> 0
        or coalesce(e->'pointEntries','[]'::jsonb) <> '[]'::jsonb
        or coalesce((e->>'finalPayrollIdr')::bigint,0)
           <> (e->>'baseSalaryIdr')::bigint + coalesce((e->>'hrAdjustmentIdr')::bigint,0)
      )
  ) then
    raise exception 'INVALID_MANUAL_PAYROLL_PAYEE' using errcode='22023';
  end if;

  if exists (
    select 1
    from (
      select e->>'payrollPeriodId' period_id,
             lower(trim(e->>'employeeName')) payee_name,
             e->>'manualPayeeType' payee_type,
             count(*) row_count
      from jsonb_array_elements(coalesce(v_next->'employeePayrolls','[]'::jsonb)) e
      where coalesce(e->>'entryMode','generated')='manual'
        and coalesce(e->>'status','draft') <> 'resolved'
      group by 1,2,3
    ) duplicates
    where duplicates.row_count > 1
  ) then
    raise exception 'DUPLICATE_MANUAL_PAYROLL_PAYEE' using errcode='23505';
  end if;

  if v_role not in ('owner','hr') and exists (
    select 1
    from jsonb_array_elements(coalesce(v_next->'employeePayrolls','[]'::jsonb)) n
    left join lateral (
      select o
      from jsonb_array_elements(coalesce(v_previous->'employeePayrolls','[]'::jsonb)) o
      where o->>'id'=n->>'id'
      limit 1
    ) previous on true
    where coalesce(n->>'entryMode','generated')='manual'
      and (
        previous.o is null
        or n->'employeeName' is distinct from previous.o->'employeeName'
        or n->'employeeRole' is distinct from previous.o->'employeeRole'
        or n->'manualPayeeType' is distinct from previous.o->'manualPayeeType'
        or n->'manualReason' is distinct from previous.o->'manualReason'
        or n->'baseSalaryIdr' is distinct from previous.o->'baseSalaryIdr'
        or n->'hrAdjustmentIdr' is distinct from previous.o->'hrAdjustmentIdr'
        or n->'finalPayrollIdr' is distinct from previous.o->'finalPayrollIdr'
      )
  ) then
    raise exception 'FINANCE_CANNOT_EDIT_MANUAL_PAYEE' using errcode='42501';
  end if;

  -- Once a period is submitted, HR may still perform the explicit workflow
  -- transitions, but cannot insert, edit, or delete the HR-owned identity and
  -- amount fields of a manual payee. Compare both snapshots so deletion is
  -- protected as strongly as insertion and editing.
  if v_role in ('owner','hr') and exists (
    select 1
    from jsonb_array_elements(coalesce(v_previous->'employeePayrolls','[]'::jsonb)) o
    full join jsonb_array_elements(coalesce(v_next->'employeePayrolls','[]'::jsonb)) n
      on n->>'id'=o->>'id'
    where (coalesce(o->>'entryMode','generated')='manual' or coalesce(n->>'entryMode','generated')='manual')
      and jsonb_build_object(
        'id',o->'id','payrollPeriodId',o->'payrollPeriodId','employeeId',o->'employeeId',
        'employeeName',o->'employeeName','employeeRole',o->'employeeRole','entryMode',o->'entryMode',
        'manualPayeeType',o->'manualPayeeType','manualReason',o->'manualReason',
        'baseSalaryIdr',o->'baseSalaryIdr','positivePoints',o->'positivePoints',
        'negativePoints',o->'negativePoints','netPoints',o->'netPoints','bonusIdr',o->'bonusIdr',
        'hrAdjustmentIdr',o->'hrAdjustmentIdr','hrAdjustmentReason',o->'hrAdjustmentReason',
        'finalPayrollIdr',o->'finalPayrollIdr','pointEntries',o->'pointEntries'
      ) is distinct from jsonb_build_object(
        'id',n->'id','payrollPeriodId',n->'payrollPeriodId','employeeId',n->'employeeId',
        'employeeName',n->'employeeName','employeeRole',n->'employeeRole','entryMode',n->'entryMode',
        'manualPayeeType',n->'manualPayeeType','manualReason',n->'manualReason',
        'baseSalaryIdr',n->'baseSalaryIdr','positivePoints',n->'positivePoints',
        'negativePoints',n->'negativePoints','netPoints',n->'netPoints','bonusIdr',n->'bonusIdr',
        'hrAdjustmentIdr',n->'hrAdjustmentIdr','hrAdjustmentReason',n->'hrAdjustmentReason',
        'finalPayrollIdr',n->'finalPayrollIdr','pointEntries',n->'pointEntries'
      )
      and exists (
        select 1
        from jsonb_array_elements(coalesce(v_previous->'payrollProposals','[]'::jsonb) || coalesce(v_next->'payrollProposals','[]'::jsonb)) p
        where p->>'payrollPeriodId'=coalesce(n->>'payrollPeriodId',o->>'payrollPeriodId')
          and p->>'status' in ('submitted_to_finance','finance_approved','paid')
      )
  ) then
    raise exception 'MANUAL_PAYEE_LOCKED_AFTER_SUBMISSION' using errcode='42501';
  end if;

  return new;
end;
$$;
revoke execute on function private.payroll_manual_payee_guard() from public, anon, authenticated;

drop trigger if exists payroll_manual_payee_guard on private.operational_domain_state;
create trigger payroll_manual_payee_guard
before insert or update of snapshot on private.operational_domain_state
for each row execute function private.payroll_manual_payee_guard();

commit;
