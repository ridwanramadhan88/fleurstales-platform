begin;

do $$
declare
  v_projection jsonb;
  v_expected_policy jsonb := jsonb_build_object('pointValueIdr',2000,'bonusCapIdr',500000);
  v_guard_source text;
begin
  v_projection := private.payroll_hr_owned_projection(jsonb_build_object(
    'employeePayrolls', jsonb_build_array(jsonb_build_object(
      'id','draft-policy-1',
      'payrollPeriodId','payroll-2026-09',
      'employeeId','emp-policy-1',
      'employeeName','Policy Staff',
      'employeeRole','florist',
      'entryMode','generated',
      'baseSalaryIdr',4000000,
      'positivePoints',10,
      'negativePoints',0,
      'netPoints',10,
      'bonusIdr',20000,
      'finalPayrollIdr',4020000,
      'pointEntries','[]'::jsonb,
      'calculationPolicy',v_expected_policy,
      'generatedAt',now(),
      'generatedBy','HR'
    )),
    'payrollProposals', jsonb_build_array(jsonb_build_object(
      'id','proposal-policy-1',
      'payrollPeriodId','payroll-2026-09',
      'employeePayrollIds',jsonb_build_array('draft-policy-1'),
      'totalBaseSalaryIdr',4000000,
      'totalBonusIdr',20000,
      'totalAdjustmentsIdr',0,
      'totalPayrollIdr',4020000,
      'calculationPolicy',v_expected_policy,
      'createdAt',now(),
      'createdBy','HR'
    ))
  ));

  if v_projection #> '{employeePayrolls,0,calculationPolicy}' is distinct from v_expected_policy then
    raise exception 'employee payroll calculation policy is not preserved by the HR-owned projection';
  end if;

  if v_projection #> '{payrollProposals,0,calculationPolicy}' is distinct from v_expected_policy then
    raise exception 'proposal calculation policy is not preserved by the HR-owned projection';
  end if;

  if to_regprocedure('private.payroll_calculation_policy_guard()') is null then
    raise exception 'payroll calculation-policy guard missing';
  end if;

  if has_function_privilege('authenticated','private.payroll_calculation_policy_guard()','EXECUTE')
     or has_function_privilege('anon','private.payroll_calculation_policy_guard()','EXECUTE') then
    raise exception 'payroll calculation-policy guard is browser-executable';
  end if;

  select pg_get_functiondef('private.payroll_calculation_policy_guard()'::regprocedure)
  into v_guard_source;

  if position('INVALID_PAYROLL_CALCULATION_POLICY' in v_guard_source)=0
     or position('PAYROLL_CALCULATION_POLICY_MISMATCH' in v_guard_source)=0
     or position('submitted_to_finance' in v_guard_source)=0 then
    raise exception 'payroll calculation-policy submission protection is incomplete';
  end if;
end;
$$;

rollback;
