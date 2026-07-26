begin;

do $$
declare
  v_size_guide_definition text;
  v_hr_definition text;
begin
  select pg_get_functiondef('public.replace_size_guide_library(jsonb,jsonb)'::regprocedure)
    into v_size_guide_definition;
  select pg_get_functiondef('public.save_hr_operational_state(bigint,jsonb)'::regprocedure)
    into v_hr_definition;

  if v_size_guide_definition not ilike '%delete from public.size_guide_targets where id is not null%'
    or v_size_guide_definition not ilike '%delete from public.size_guide_templates where id is not null%' then
    raise exception 'Size-guide replacement still contains an unsafe unfiltered delete';
  end if;

  if v_hr_definition not ilike '%delete from public.staff_schedule_defaults where employee_id is not null%'
    or v_hr_definition not ilike '%delete from public.staff_schedule_overrides where employee_id is not null%'
    or v_hr_definition not ilike '%delete from public.staff_attendance_records where id is not null%' then
    raise exception 'HR replacement still contains an unsafe unfiltered delete';
  end if;
end;
$$;

rollback;
