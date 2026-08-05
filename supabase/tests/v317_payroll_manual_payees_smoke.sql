begin;

select private.payroll_hr_owned_projection(jsonb_build_object(
  'employeePayrolls', jsonb_build_array(jsonb_build_object(
    'id','manual-1',
    'payrollPeriodId','payroll-2026-08',
    'employeeId','manual-payee:payroll-2026-08:1',
    'employeeName','Owner',
    'employeeRole','owner',
    'entryMode','manual',
    'manualPayeeType','owner',
    'manualReason','Owner compensation',
    'baseSalaryIdr',10000000,
    'positivePoints',0,
    'negativePoints',0,
    'netPoints',0,
    'bonusIdr',0,
    'finalPayrollIdr',10000000,
    'hrAdjustmentIdr',0,
    'pointEntries','[]'::jsonb,
    'generatedAt',now(),
    'generatedBy','HR'
  ))
))->'employeePayrolls' as protected_manual_payee_projection;

do $$
declare
  v_guard_source text;
begin
  if to_regprocedure('private.payroll_manual_payee_guard()') is null then
    raise exception 'payroll manual-payee guard missing';
  end if;

  if has_function_privilege('authenticated','private.payroll_manual_payee_guard()','EXECUTE')
     or has_function_privilege('anon','private.payroll_manual_payee_guard()','EXECUTE') then
    raise exception 'payroll manual-payee guard is browser-executable';
  end if;

  select pg_get_functiondef('private.payroll_manual_payee_guard()'::regprocedure)
  into v_guard_source;
  if position('FINANCE_CANNOT_EDIT_MANUAL_PAYEE' in v_guard_source)=0
     or position('MANUAL_PAYEE_LOCKED_AFTER_SUBMISSION' in v_guard_source)=0
     or position('full join' in lower(v_guard_source))=0 then
    raise exception 'manual-payee edit or deletion protection is incomplete';
  end if;
end;
$$;

rollback;
