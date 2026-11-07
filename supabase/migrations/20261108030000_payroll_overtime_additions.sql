-- Lembur dari check-out + tambahan/potongan gaji per baris (keputusan Owner 8 Nov 2026).
--
-- * A check-out after the shift end carries the employee's choice: 'overtime'
--   (lembur, goes to HR for confirmation) or 'late_checkout' (telat check-out,
--   not paid). The choice is part of the server-owned attendance evidence.
-- * HR confirms overtime and enters the amount; the confirmed amount lands in
--   the payroll row as an itemised addition line. Lines also hold allowances,
--   fees, manual bonuses, meal/transport and deductions. `hrAdjustmentIdr`
--   stays the total of the lines, so every existing payroll check keeps working.

begin;

do $patch$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  -- 1. Self check-out stores the employee's reason (validated).
  v_def := pg_get_functiondef('public.save_my_attendance_record_v310_internal(jsonb)'::regprocedure);
  v_old := $o$'checkOutLocation',v_evidence,'actor',v_profile.display_name)$o$;
  v_new := $n$'checkOutLocation',v_evidence,'actor',v_profile.display_name)||jsonb_strip_nulls(jsonb_build_object('checkOutReason',case when p_record->>'checkOutReason' in ('overtime','late_checkout') then p_record->>'checkOutReason' end,'checkOutReasonNote',left(nullif(trim(p_record->>'checkOutReasonNote'),''),300)))$n$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'save_my_attendance_record_v310_internal: checkout anchor not found exactly once';
  end if;
  execute replace(v_def, v_old, v_new);

  -- 2. HR snapshot saves cannot rewrite the employee's reason.
  v_def := pg_get_functiondef('public.save_hr_operational_state_unchecked(bigint,jsonb)'::regprocedure);
  v_old := $o$- 'checkOutLocation'$o$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'save_hr_operational_state_unchecked: strip anchor not found exactly once';
  end if;
  v_def := replace(v_def, v_old, $n$- 'checkOutLocation'
            - 'checkOutReason'
            - 'checkOutReasonNote'$n$);
  v_old := $o$'checkOutLocation',ar.record->'checkOutLocation'$o$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'save_hr_operational_state_unchecked: copy anchor not found exactly once';
  end if;
  execute replace(v_def, v_old, $n$'checkOutLocation',ar.record->'checkOutLocation',
            'checkOutReason',ar.record->'checkOutReason',
            'checkOutReasonNote',ar.record->'checkOutReasonNote'$n$);

  -- 3. Addition lines are HR-owned: Finance cannot change them.
  v_def := pg_get_functiondef('private.payroll_hr_owned_projection(jsonb)'::regprocedure);
  v_old := $o$'hrAdjustmentReason', e->'hrAdjustmentReason',$o$;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'payroll_hr_owned_projection: anchor not found exactly once';
  end if;
  execute replace(v_def, v_old, $n$'hrAdjustmentReason', e->'hrAdjustmentReason',
        'hrAdjustments', e->'hrAdjustments',$n$);
end
$patch$;

-- 4. A new month's payroll period is created in HR's browser (ensureCurrentPeriod)
--    and travels with the first "generate". The scope check rejected any period
--    change for HR commands, so payroll could never be generated for a month the
--    server had not seen yet (production only had payroll-2026-07). HR commands
--    may now append new periods; existing periods stay untouchable.
create or replace function private.payroll_periods_only_appended(p_previous jsonb, p_next jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(coalesce(p_next,'[]'::jsonb)) = 'array'
    -- every existing period is still there, unchanged
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_previous,'[]'::jsonb)) o
      where not exists (select 1 from jsonb_array_elements(coalesce(p_next,'[]'::jsonb)) n where n = o)
    )
    -- the additions are well-formed new periods with unique ids
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_next,'[]'::jsonb)) n
      where not exists (select 1 from jsonb_array_elements(coalesce(p_previous,'[]'::jsonb)) o where o = n)
        and (coalesce(n->>'id','') !~ '^payroll-[0-9]{4}-[0-9]{2}$'
             or coalesce(n->>'periodStart','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             or coalesce(n->>'periodEnd','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             or exists (select 1 from jsonb_array_elements(coalesce(p_previous,'[]'::jsonb)) o where o->>'id' = n->>'id'))
    )
    and (select count(*) = count(distinct n->>'id') from jsonb_array_elements(coalesce(p_next,'[]'::jsonb)) n);
$$;
revoke execute on function private.payroll_periods_only_appended(jsonb,jsonb) from public, anon, authenticated;

do $scope$
declare
  v_def text := pg_get_functiondef('private.apply_payroll_workflow_state(text,bigint,jsonb)'::regprocedure);
  v_old constant text := $o$    if not (v_changed_key = any(v_allowed_keys))
      and (v_previous->v_changed_key) is distinct from (p_snapshot->v_changed_key)
    then$o$;
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'apply_payroll_workflow_state: scope anchor not found exactly once';
  end if;
  execute replace(v_def, v_old, $n$    if not (v_changed_key = any(v_allowed_keys))
      and (v_previous->v_changed_key) is distinct from (p_snapshot->v_changed_key)
      and not (
        v_changed_key = 'periods'
        and p_command in ('generate','prepare','submit')
        and private.payroll_periods_only_appended(v_previous->'periods', p_snapshot->'periods')
      )
    then$n$);
end
$scope$;

-- 5. Addition lines must be well formed and add up to hrAdjustmentIdr.
create or replace function private.payroll_adjustment_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_line jsonb;
  v_sum bigint;
  v_kind text;
  v_amount bigint;
begin
  if new.domain <> 'payroll' then return new; end if;

  for v_row in select value from jsonb_array_elements(coalesce(new.snapshot->'employeePayrolls','[]'::jsonb))
  loop
    if v_row->'hrAdjustments' is null or jsonb_typeof(v_row->'hrAdjustments') = 'null' then continue; end if;
    if jsonb_typeof(v_row->'hrAdjustments') <> 'array' then
      raise exception 'INVALID_PAYROLL_ADJUSTMENT_LINES payroll=%', v_row->>'id' using errcode = '22023';
    end if;
    v_sum := 0;
    for v_line in select value from jsonb_array_elements(v_row->'hrAdjustments')
    loop
      v_kind := v_line->>'kind';
      if coalesce(v_line->>'amountIdr','') !~ '^-?[0-9]+$' then
        raise exception 'INVALID_PAYROLL_ADJUSTMENT_LINE payroll=% line=%', v_row->>'id', v_line->>'id' using errcode = '22023';
      end if;
      v_amount := (v_line->>'amountIdr')::bigint;
      if nullif(v_line->>'id','') is null
        or v_kind is null
        or v_kind not in ('overtime','allowance','fee','bonus','meal_transport','deduction','adjustment')
        or v_amount = 0
        or (v_kind = 'deduction' and v_amount > 0)
        or (v_kind not in ('deduction','adjustment') and v_amount < 0)
        or (v_kind = 'overtime' and nullif(v_line->>'attendanceCaseId','') is null)
        or (v_kind <> 'overtime' and coalesce(v_line->>'reason','') !~ '\S{3}')
      then
        raise exception 'INVALID_PAYROLL_ADJUSTMENT_LINE payroll=% line=%', v_row->>'id', v_line->>'id' using errcode = '22023';
      end if;
      v_sum := v_sum + v_amount;
    end loop;
    if v_sum <> coalesce((v_row->>'hrAdjustmentIdr')::bigint, 0) then
      raise exception 'PAYROLL_ADJUSTMENT_TOTAL_MISMATCH payroll=% lines=% total=%', v_row->>'id', v_sum, v_row->>'hrAdjustmentIdr'
        using errcode = '23514';
    end if;
  end loop;

  -- One attendance overtime is paid at most once.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(new.snapshot->'employeePayrolls','[]'::jsonb)) e,
         jsonb_array_elements(case when jsonb_typeof(e->'hrAdjustments') = 'array' then e->'hrAdjustments' else '[]'::jsonb end) l
    where coalesce(e->>'status','draft') <> 'resolved' and l->>'kind' = 'overtime'
    group by l->>'attendanceCaseId'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_OVERTIME_PAYMENT' using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke execute on function private.payroll_adjustment_lines_guard() from public, anon, authenticated;

drop trigger if exists payroll_adjustment_lines_guard on private.operational_domain_state;
create trigger payroll_adjustment_lines_guard
before insert or update of snapshot on private.operational_domain_state
for each row
when (new.domain = 'payroll')
execute function private.payroll_adjustment_lines_guard();

notify pgrst, 'reload schema';

commit;

-- 6. Finance-owned projection ignores drafts/proposals that carry no Finance
--    data yet. Before this, every newly generated draft appeared as
--    {id, financeReviewedAt:null, ...}, so HR "generate" from an empty period
--    always failed with PAYROLL_HR_CANNOT_MUTATE_FINANCE_FIELDS. Removing or
--    changing a row that Finance already touched is still rejected.
create or replace function private.payroll_finance_owned_projection(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $function$
  select jsonb_build_object(
    'employeePayrolls', coalesce((
      select jsonb_agg(x.v order by x.v->>'id')
      from (
        select jsonb_strip_nulls(jsonb_build_object(
          'id', e->>'id',
          'financeReviewedAt', e->'financeReviewedAt',
          'financeReviewedBy', e->'financeReviewedBy',
          'paidAt', e->'paidAt',
          'paidBy', e->'paidBy',
          'paymentMethod', e->'paymentMethod',
          'paymentReference', e->'paymentReference',
          'paymentNote', e->'paymentNote'
        )) v
        from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) e
      ) x
      where x.v - 'id' <> '{}'::jsonb
    ), '[]'::jsonb),
    'payrollProposals', coalesce((
      select jsonb_agg(x.v order by x.v->>'id')
      from (
        select jsonb_strip_nulls(jsonb_build_object(
          'id', p->>'id',
          'financeDecisionAt', p->'financeDecisionAt',
          'financeDecisionBy', p->'financeDecisionBy',
          'financeNote', p->'financeNote',
          'paidAt', p->'paidAt',
          'paidBy', p->'paidBy',
          'paymentMethod', p->'paymentMethod',
          'paymentReference', p->'paymentReference',
          'paymentNote', p->'paymentNote'
        )) v
        from jsonb_array_elements(coalesce(p_snapshot->'payrollProposals','[]'::jsonb)) p
      ) x
      where x.v - 'id' <> '{}'::jsonb
    ), '[]'::jsonb),
    'financePayrollReviews', coalesce((
      select jsonb_agg(r order by r->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'payrollReviews','[]'::jsonb)) r
      where coalesce(r->>'decision','') <> 'resolved'
    ), '[]'::jsonb),
    'proposalReviews', coalesce(p_snapshot->'payrollProposalReviews','[]'::jsonb),
    'scheduleAdjustments', coalesce(p_snapshot->'payrollScheduleAdjustments','[]'::jsonb)
  )
$function$;
