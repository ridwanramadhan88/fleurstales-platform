-- Lembur dari check-out + baris tambahan/potongan gaji (2026-11-08). Rolls back.
begin;

do $static$
declare v_source text;
begin
  -- Self check-out keeps the employee's validated choice.
  v_source := pg_get_functiondef('public.save_my_attendance_record_v310_internal(jsonb)'::regprocedure);
  if position('checkOutReason' in v_source) = 0 or position('''overtime'',''late_checkout''' in v_source) = 0 then
    raise exception 'self check-out does not store a validated overtime/late reason';
  end if;
  -- HR snapshot saves cannot rewrite it.
  v_source := pg_get_functiondef('public.save_hr_operational_state_unchecked(bigint,jsonb)'::regprocedure);
  if position('- ''checkOutReason''' in v_source) = 0 or position('''checkOutReason'',ar.record->''checkOutReason''' in v_source) = 0 then
    raise exception 'HR snapshot can overwrite the check-out reason';
  end if;
  -- Finance cannot change HR's addition lines.
  if private.payroll_hr_owned_projection(jsonb_build_object('employeePayrolls', jsonb_build_array(jsonb_build_object(
       'id','p1','hrAdjustments', jsonb_build_array(jsonb_build_object('id','l1','kind','fee','amountIdr',1000,'reason','Fee'))))))
     ->'employeePayrolls'->0->'hrAdjustments' is null then
    raise exception 'addition lines are not part of the HR-owned payroll projection';
  end if;
  if has_function_privilege('authenticated', 'private.payroll_adjustment_lines_guard()', 'EXECUTE') then
    raise exception 'payroll line guard is browser-executable';
  end if;
end
$static$;

-- HR commands may append a new month's period, never change existing ones.
do $periods$
declare
  v_old jsonb := jsonb_build_array(jsonb_build_object('id','payroll-2026-07','periodStart','2026-07-01','periodEnd','2026-07-31','status','paid'));
  v_new jsonb := jsonb_build_object('id','payroll-2026-11','periodStart','2026-11-01','periodEnd','2026-11-30','status','hr_preparation');
begin
  if not private.payroll_periods_only_appended(v_old, v_old || jsonb_build_array(v_new)) then
    raise exception 'appending a new period was rejected';
  end if;
  if private.payroll_periods_only_appended(v_old, jsonb_build_array(v_old->0 || '{"periodEnd":"2026-08-05"}'::jsonb)) then
    raise exception 'changing an existing period was accepted';
  end if;
  if private.payroll_periods_only_appended(v_old, '[]'::jsonb) then
    raise exception 'removing a period was accepted';
  end if;
  if private.payroll_periods_only_appended(v_old, v_old || jsonb_build_array(v_new || '{"id":"hack"}'::jsonb)) then
    raise exception 'malformed period id accepted';
  end if;
  if private.payroll_periods_only_appended(v_old, v_old || jsonb_build_array(v_new, v_new || '{"status":"paid"}'::jsonb)) then
    raise exception 'duplicate period id accepted';
  end if;
  if position('payroll_periods_only_appended' in pg_get_functiondef('private.apply_payroll_workflow_state(text,bigint,jsonb)'::regprocedure)) = 0 then
    raise exception 'payroll command scope does not allow appending periods';
  end if;
end
$periods$;

-- The guard runs on every payroll snapshot write.
insert into private.operational_domain_state(domain, revision, snapshot, updated_at)
values ('payroll', 1, '{"employeePayrolls":[]}'::jsonb, now())
on conflict (domain) do nothing;

create function pg_temp.payroll_row(p_lines jsonb, p_total bigint, p_id text default 'smoke-payroll-1', p_status text default 'draft')
returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'payrollPeriodId', 'payroll-smoke', 'employeeId', 'emp-'||p_id, 'employeeName', 'Smoke',
    'employeeRole', 'florist', 'entryMode', 'generated', 'status', p_status, 'baseSalaryIdr', 3000000, 'bonusIdr', 0,
    'hrAdjustmentIdr', p_total, 'hrAdjustments', p_lines, 'finalPayrollIdr', 3000000 + p_total, 'pointEntries', '[]'::jsonb)
$$;

create function pg_temp.try_write(p_rows jsonb) returns text language plpgsql as $$
begin
  update private.operational_domain_state
  set snapshot = jsonb_set(snapshot, '{employeePayrolls}', coalesce(snapshot->'employeePayrolls','[]'::jsonb) || p_rows, true)
  where domain = 'payroll';
  return 'ok';
exception when others then
  return split_part(sqlerrm, ' ', 1);
end
$$;

do $guard$
declare
  v_ok jsonb := jsonb_build_array(
    jsonb_build_object('id','ot-1','kind','overtime','amountIdr',45000,'reason','Lembur 1 jam 30 menit','attendanceCaseId','review-att-1-overtime','overtimeMinutes',90),
    jsonb_build_object('id','fee-1','kind','fee','amountIdr',150000,'reason','Fee instalasi'),
    jsonb_build_object('id','ded-1','kind','deduction','amountIdr',-50000,'reason','Kasbon'));
  v_result text;
begin
  v_result := pg_temp.try_write(jsonb_build_array(pg_temp.payroll_row(v_ok, 145000)));
  if v_result <> 'ok' then raise exception 'valid lines rejected: %', v_result; end if;

  v_result := pg_temp.try_write(jsonb_build_array(pg_temp.payroll_row(v_ok, 999, 'smoke-payroll-2')));
  if v_result <> 'PAYROLL_ADJUSTMENT_TOTAL_MISMATCH' then raise exception 'total mismatch accepted: %', v_result; end if;

  v_result := pg_temp.try_write(jsonb_build_array(pg_temp.payroll_row(
    jsonb_build_array(jsonb_build_object('id','x','kind','deduction','amountIdr',50000,'reason','Kasbon')), 50000, 'smoke-payroll-3')));
  if v_result <> 'INVALID_PAYROLL_ADJUSTMENT_LINE' then raise exception 'positive deduction accepted: %', v_result; end if;

  v_result := pg_temp.try_write(jsonb_build_array(pg_temp.payroll_row(
    jsonb_build_array(jsonb_build_object('id','x','kind','overtime','amountIdr',10000,'reason','Lembur')), 10000, 'smoke-payroll-4')));
  if v_result <> 'INVALID_PAYROLL_ADJUSTMENT_LINE' then raise exception 'overtime without attendance accepted: %', v_result; end if;

  v_result := pg_temp.try_write(jsonb_build_array(pg_temp.payroll_row(
    jsonb_build_array(jsonb_build_object('id','x','kind','salary','amountIdr',10000,'reason','Tidak dikenal')), 10000, 'smoke-payroll-5')));
  if v_result <> 'INVALID_PAYROLL_ADJUSTMENT_LINE' then raise exception 'unknown kind accepted: %', v_result; end if;

  -- The same attendance overtime cannot be paid in two payroll rows.
  v_result := pg_temp.try_write(jsonb_build_array(pg_temp.payroll_row(
    jsonb_build_array(jsonb_build_object('id','ot-dup','kind','overtime','amountIdr',45000,'reason','Lembur','attendanceCaseId','review-att-1-overtime')), 45000, 'smoke-payroll-6')));
  if v_result <> 'DUPLICATE_OVERTIME_PAYMENT' then raise exception 'duplicate overtime accepted: %', v_result; end if;

  -- Rows saved before itemisation (no lines) keep working.
  v_result := pg_temp.try_write(jsonb_build_array(pg_temp.payroll_row(null, 25000, 'smoke-payroll-7') - 'hrAdjustments'));
  if v_result <> 'ok' then raise exception 'legacy adjustment row rejected: %', v_result; end if;
end
$guard$;

rollback;

-- Finance projection: new drafts without Finance data do not count as Finance
-- changes; a draft Finance reviewed still does.
do $$
begin
  if private.payroll_finance_owned_projection('{"employeePayrolls":[]}'::jsonb)
     is distinct from private.payroll_finance_owned_projection('{"employeePayrolls":[{"id":"d1","status":"draft","financeReviewedAt":null}]}'::jsonb) then
    raise exception 'new draft without Finance data must not change the Finance projection';
  end if;
  if private.payroll_finance_owned_projection('{"employeePayrolls":[{"id":"d1","financeReviewedAt":"2026-11-01T00:00:00Z"}]}'::jsonb)
     = private.payroll_finance_owned_projection('{"employeePayrolls":[]}'::jsonb) then
    raise exception 'removing a Finance-reviewed draft must change the Finance projection';
  end if;
  if private.payroll_finance_owned_projection('{"employeePayrolls":[{"id":"d1","paidAt":"2026-11-01T00:00:00Z"}]}'::jsonb)
     = private.payroll_finance_owned_projection('{"employeePayrolls":[{"id":"d1","paidAt":"2026-11-02T00:00:00Z"}]}'::jsonb) then
    raise exception 'changing paidAt must change the Finance projection';
  end if;
end $$;
