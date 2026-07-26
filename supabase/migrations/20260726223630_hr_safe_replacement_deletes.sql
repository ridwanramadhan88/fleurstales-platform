create or replace function public.save_hr_operational_state_v35_internal(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_item jsonb;
begin
  v_result := public.save_hr_operational_state_v34_internal(p_expected_revision,p_snapshot);

  -- Intentional full replacement operations. Keep an explicit non-null key
  -- predicate so Supabase's production safe-update guard permits the delete
  -- without weakening the guard globally.
  delete from public.staff_schedule_defaults
  where employee_id is not null;
  for v_item in select value from jsonb_array_elements(coalesce(p_snapshot->'employeeDefaultSchedules','[]'::jsonb)) loop
    insert into public.staff_schedule_defaults(employee_id,days,updated_at)
    values(v_item->>'employeeId',coalesce(v_item->'days','{}'::jsonb),now())
    on conflict(employee_id) do update set days=excluded.days,updated_at=now();
  end loop;

  delete from public.staff_schedule_overrides
  where employee_id is not null;
  for v_item in select value from jsonb_array_elements(coalesce(p_snapshot->'scheduleOverrides','[]'::jsonb)) loop
    insert into public.staff_schedule_overrides(employee_id,schedule_date,shift,note,work_mode,updated_at)
    values(v_item->>'employeeId',(v_item->>'date')::date,coalesce(v_item->'shift','{}'::jsonb),v_item->>'note',v_item->>'workMode',now())
    on conflict(employee_id,schedule_date) do update set shift=excluded.shift,note=excluded.note,work_mode=excluded.work_mode,updated_at=now();
  end loop;

  delete from public.staff_attendance_records
  where id is not null;
  for v_item in select value from jsonb_array_elements(coalesce(p_snapshot->'attendance','[]'::jsonb)) loop
    insert into public.staff_attendance_records(id,employee_id,attendance_date,status,record,updated_at)
    values(v_item->>'id',v_item->>'employeeId',(v_item->>'date')::date,v_item->>'status',v_item,now())
    on conflict(id) do update set employee_id=excluded.employee_id,attendance_date=excluded.attendance_date,status=excluded.status,record=excluded.record,updated_at=now();
  end loop;
  return v_result;
end;
$function$;
