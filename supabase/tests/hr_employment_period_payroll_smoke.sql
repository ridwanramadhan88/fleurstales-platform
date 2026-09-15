begin;

do $$
begin
  if to_regprocedure('private.assert_payroll_employment_coverage(jsonb)') is null then
    raise exception 'missing private.assert_payroll_employment_coverage(jsonb)';
  end if;

  if to_regprocedure('public.payroll_generate(bigint,jsonb)') is null then
    raise exception 'missing public.payroll_generate(bigint,jsonb)';
  end if;

  if position(
    'assert_payroll_employment_coverage'
    in pg_get_functiondef('public.payroll_generate(bigint,jsonb)'::regprocedure)
  ) = 0 then
    raise exception 'payroll_generate does not enforce employment-period coverage';
  end if;
end;
$$;

rollback;