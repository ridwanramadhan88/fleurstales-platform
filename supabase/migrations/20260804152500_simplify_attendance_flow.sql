-- Simple, server-authoritative attendance:
-- 1. A dated working schedule is mandatory.
-- 2. GPS failures cannot be replaced with branch coordinates.
-- 3. Check-out opens from the configured checkout window.
-- 4. Generic HR saves preserve normalized selfie/location evidence.

create or replace function public.save_my_attendance_record(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_now timestamptz := now();
  v_date date := timezone('Asia/Jakarta',v_now)::date;
  v_current time := timezone('Asia/Jakarta',v_now)::time;
  v_record_date date;
  v_is_checkout boolean := nullif(p_record->>'checkOutSelfieDataUrl','') is not null;
  v_path text;
  v_shift jsonb;
  v_existing jsonb;
  v_scheduled_end time;
  v_checkout_window integer;
  v_minutes_until_end integer;
begin
  select *
  into v_profile
  from public.staff_access_profiles
  where user_id=(select auth.uid())
    and is_active=true
    and role in ('admin','florist')
  limit 1;

  if not found then
    raise exception 'SELF_ATTENDANCE_ROLE_REQUIRED' using errcode='42501';
  end if;

  begin
    v_record_date := nullif(p_record->>'date','')::date;
  exception when others then
    raise exception 'ATTENDANCE_DATE_MUST_BE_TODAY' using errcode='22023';
  end;

  if v_record_date is distinct from v_date then
    raise exception 'ATTENDANCE_DATE_MUST_BE_TODAY' using errcode='22023';
  end if;

  select shift
  into v_shift
  from public.staff_schedule_overrides
  where employee_id=v_profile.employee_id
    and schedule_date=v_date;

  if v_shift is null
    or not coalesce((v_shift->>'isWorking')::boolean,false)
    or nullif(v_shift->>'branchId','') is null
  then
    raise exception 'DATED_ATTENDANCE_SCHEDULE_REQUIRED' using errcode='22023';
  end if;

  v_path := case
    when v_is_checkout then nullif(p_record->>'checkOutSelfieDataUrl','')
    else nullif(p_record->>'selfieDataUrl','')
  end;

  if v_path is null
    or not private.attendance_selfie_object_is_valid(
      v_path,
      v_profile.employee_id,
      v_date,
      case when v_is_checkout then 'checkout' else 'checkin' end
    )
  then
    raise exception 'ATTENDANCE_SELFIE_OBJECT_REQUIRED' using errcode='22023';
  end if;

  if exists(
    select 1
    from public.staff_attendance_records ar
    where (ar.record->>'selfieDataUrl'=v_path or ar.record->>'checkOutSelfieDataUrl'=v_path)
      and not(ar.employee_id=v_profile.employee_id and ar.attendance_date=v_date)
  ) then
    raise exception 'ATTENDANCE_SELFIE_ALREADY_USED' using errcode='23505';
  end if;

  if v_is_checkout then
    select record
    into v_existing
    from public.staff_attendance_records
    where employee_id=v_profile.employee_id
      and attendance_date=v_date;

    if v_existing is null or nullif(v_existing->>'checkInAt','') is null then
      raise exception 'CHECKOUT_REQUIRES_EXISTING_CHECKIN' using errcode='22023';
    end if;

    v_scheduled_end := coalesce(
      nullif(v_existing->'checkInLocation'->>'scheduledEndTime','')::time,
      nullif(v_shift->>'endTime','')::time
    );

    select coalesce((attendance->>'checkoutGraceMinutes')::integer,30)
    into v_checkout_window
    from private.internal_settings_state
    where id='primary';

    if v_scheduled_end is null then
      raise exception 'DATED_ATTENDANCE_SCHEDULE_REQUIRED' using errcode='22023';
    end if;

    v_minutes_until_end := floor(extract(epoch from (v_scheduled_end - v_current)) / 60);
    if v_scheduled_end <= '04:00'::time and v_current >= '12:00'::time then
      v_minutes_until_end := v_minutes_until_end + 24 * 60;
    end if;

    if v_minutes_until_end > greatest(0,v_checkout_window) then
      raise exception 'CHECKOUT_NOT_YET_AVAILABLE' using errcode='22023';
    end if;
  end if;

  return public.save_my_attendance_record_v310_internal(p_record);
end;
$function$;

revoke execute on function public.save_my_attendance_record(jsonb) from public,anon;
grant execute on function public.save_my_attendance_record(jsonb) to authenticated;

create or replace function public.save_hr_operational_state(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_points jsonb;
  v_attendance jsonb;
  v_missing_attendance jsonb;
  v_snapshot jsonb := coalesce(p_snapshot, '{}'::jsonb);
  v_state private.operational_domain_state%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'INVALID_EXPECTED_REVISION' using errcode='22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'SNAPSHOT_OBJECT_REQUIRED' using errcode='22023';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(coalesce(v_snapshot->'attendance','[]'::jsonb)) incoming(value)
    where incoming.value->>'source'='selfie'
      and not exists(
        select 1
        from public.staff_attendance_records ar
        where ar.employee_id=incoming.value->>'employeeId'
          and ar.attendance_date=nullif(incoming.value->>'date','')::date
      )
  ) then
    raise exception 'ATTENDANCE_SELF_SERVICE_RECORD_SERVER_OWNED' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      case
        when ar.record is null then incoming.value
        else
          (
            incoming.value
            - 'id'
            - 'employeeId'
            - 'date'
            - 'actor'
            - 'createdAt'
            - 'source'
            - 'selfieDataUrl'
            - 'checkInAt'
            - 'checkInLocation'
            - 'checkOutSelfieDataUrl'
            - 'checkOutAt'
            - 'checkOutLocation'
          )
          || jsonb_strip_nulls(jsonb_build_object(
            'id',ar.record->'id',
            'employeeId',ar.record->'employeeId',
            'date',ar.record->'date',
            'actor',ar.record->'actor',
            'createdAt',ar.record->'createdAt',
            'source',ar.record->'source',
            'selfieDataUrl',ar.record->'selfieDataUrl',
            'checkInAt',ar.record->'checkInAt',
            'checkInLocation',ar.record->'checkInLocation',
            'checkOutSelfieDataUrl',ar.record->'checkOutSelfieDataUrl',
            'checkOutAt',ar.record->'checkOutAt',
            'checkOutLocation',ar.record->'checkOutLocation'
          ))
      end
      order by incoming.ordinality
    ),
    '[]'::jsonb
  )
  into v_attendance
  from jsonb_array_elements(coalesce(v_snapshot->'attendance','[]'::jsonb))
    with ordinality incoming(value,ordinality)
  left join public.staff_attendance_records ar
    on ar.employee_id=incoming.value->>'employeeId'
   and ar.attendance_date=nullif(incoming.value->>'date','')::date;

  select coalesce(jsonb_agg(ar.record order by ar.attendance_date,ar.employee_id),'[]'::jsonb)
  into v_missing_attendance
  from public.staff_attendance_records ar
  where not exists(
    select 1
    from jsonb_array_elements(coalesce(v_snapshot->'attendance','[]'::jsonb)) incoming(value)
    where incoming.value->>'employeeId'=ar.employee_id
      and incoming.value->>'date'=ar.attendance_date::text
  );

  v_snapshot := jsonb_set(
    v_snapshot,
    '{attendance}',
    coalesce(v_attendance,'[]'::jsonb) || coalesce(v_missing_attendance,'[]'::jsonb),
    true
  );

  select coalesce(
    jsonb_agg(private.employee_point_event_json(e) order by e.created_at desc,e.id),
    '[]'::jsonb
  )
  into v_points
  from public.employee_point_events e;

  v_snapshot := jsonb_set(v_snapshot,'{employeePointEntries}',v_points,true);

  select *
  into v_state
  from private.operational_domain_state
  where domain='hr';

  if found then
    if v_state.revision <> p_expected_revision then
      if v_state.snapshot = v_snapshot then
        return jsonb_build_object(
          'domain',v_state.domain,
          'revision',v_state.revision,
          'snapshot',v_state.snapshot,
          'updatedAt',v_state.updated_at
        );
      end if;

      raise exception 'REVISION_CONFLICT:hr:expected=%:actual=%',
        p_expected_revision,v_state.revision
        using errcode='40001';
    end if;
  elsif p_expected_revision <> 0 then
    raise exception 'REVISION_CONFLICT:hr:expected=%:actual=0',
      p_expected_revision
      using errcode='40001';
  end if;

  return public.save_hr_operational_state_v36_internal(
    p_expected_revision,
    v_snapshot
  );
end;
$function$;

revoke execute on function public.save_hr_operational_state(bigint,jsonb) from public,anon;
grant execute on function public.save_hr_operational_state(bigint,jsonb) to authenticated;
