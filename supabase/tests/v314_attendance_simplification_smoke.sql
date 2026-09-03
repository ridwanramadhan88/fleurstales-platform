-- Attendance simplification authority and compatibility checks.

do $$
declare
  v_self_source text;
  v_hr_wrapper_source text;
  v_hr_internal_source text;
begin
  if not has_function_privilege('authenticated','public.save_my_attendance_record(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.save_my_attendance_record(jsonb)','EXECUTE') then
    raise exception 'Self-attendance RPC grants are incorrect';
  end if;

  if not has_function_privilege('authenticated','public.save_hr_operational_state(bigint,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.save_hr_operational_state(bigint,jsonb)','EXECUTE') then
    raise exception 'HR state RPC grants are incorrect';
  end if;

  select pg_get_functiondef('public.save_my_attendance_record(jsonb)'::regprocedure)
  into v_self_source;
  if position('DATED_ATTENDANCE_SCHEDULE_REQUIRED' in v_self_source)=0
     or position('attendance_selfie_object_is_valid' in v_self_source)=0
     or position('v_minutes_until_end' in v_self_source)=0
     or position('save_my_attendance_record_v310_internal' in v_self_source)=0 then
    raise exception 'Self-attendance wrapper lost schedule, evidence, overnight checkout, or V3.10 authority checks';
  end if;

  select pg_get_functiondef('public.save_hr_operational_state(bigint,jsonb)'::regprocedure)
  into v_hr_wrapper_source;
  if position('save_hr_operational_state_unchecked' in v_hr_wrapper_source)=0
     or position('mutation_conflict_circuit_is_blocked' in v_hr_wrapper_source)=0 then
    raise exception 'HR public wrapper lost guarded delegation or conflict circuit';
  end if;

  select pg_get_functiondef('public.save_hr_operational_state_unchecked(bigint,jsonb)'::regprocedure)
  into v_hr_internal_source;
  if position('ATTENDANCE_SELF_SERVICE_RECORD_SERVER_OWNED' in v_hr_internal_source)=0
     or position('checkInLocation' in v_hr_internal_source)=0
     or position('checkOutLocation' in v_hr_internal_source)=0
     or position('save_hr_operational_state_v36_internal' in v_hr_internal_source)=0 then
    raise exception 'HR internal mutation lost immutable evidence or established authority delegation';
  end if;

  if has_function_privilege('authenticated','public.save_my_attendance_record_v310_internal(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.save_hr_operational_state_v36_internal(bigint,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.save_hr_operational_state_unchecked(bigint,jsonb)','EXECUTE') then
    raise exception 'Authenticated clients can bypass attendance authority wrappers';
  end if;
end $$;
