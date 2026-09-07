-- Staff authentication must not depend on today's schedule.
--
-- Admin and Florist remain branch-scoped for operational writes, so they still
-- need an active operational branch in the runtime context. A dated schedule,
-- when present, is recorded separately as scheduled_branch_id, but the runtime
-- setter no longer rejects an otherwise-authorized Admin merely because today
-- has no dated schedule. Attendance remains schedule-authoritative in
-- save_my_attendance_record() and is intentionally unchanged here.

create or replace function public.set_staff_runtime_context(
  p_scheduled_branch_id text,
  p_operational_branch_id text,
  p_operational_date date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_session_id uuid := nullif((select auth.jwt()->>'session_id'),'')::uuid;
  v_previous_operational text;
begin
  if (select auth.uid()) is null or v_role is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if v_session_id is null then
    raise exception 'AUTH_SESSION_REQUIRED' using errcode='42501';
  end if;
  if p_operational_date <> v_today then
    raise exception 'RUNTIME_CONTEXT_DATE_MUST_BE_TODAY' using errcode='22023';
  end if;

  -- Branch-scoped staff still require a real active operational branch. This
  -- is an RLS/workspace scope, not proof that they were scheduled to work.
  if v_role in ('admin','florist') and p_operational_branch_id is null then
    raise exception 'OPERATIONAL_BRANCH_REQUIRED' using errcode='22023';
  end if;
  if p_scheduled_branch_id is not null and not exists(
    select 1 from public.branches
    where id=p_scheduled_branch_id and is_active=true
  ) then
    raise exception 'INVALID_SCHEDULED_BRANCH' using errcode='22023';
  end if;
  if p_operational_branch_id is not null and not exists(
    select 1 from public.branches
    where id=p_operational_branch_id and is_active=true
  ) then
    raise exception 'INVALID_OPERATIONAL_BRANCH' using errcode='22023';
  end if;

  select operational_branch_id into v_previous_operational
  from private.staff_runtime_context
  where session_id=v_session_id
    and user_id=(select auth.uid())
    and operational_date=p_operational_date;

  insert into private.staff_runtime_context(
    session_id,user_id,operational_date,scheduled_branch_id,operational_branch_id,updated_at
  )
  values (
    v_session_id,(select auth.uid()),p_operational_date,p_scheduled_branch_id,p_operational_branch_id,now()
  )
  on conflict(session_id) do update
  set user_id=excluded.user_id,
      operational_date=excluded.operational_date,
      scheduled_branch_id=excluded.scheduled_branch_id,
      operational_branch_id=excluded.operational_branch_id,
      updated_at=excluded.updated_at;

  if v_previous_operational is distinct from p_operational_branch_id then
    perform private.write_business_activity(
      'hr',v_session_id::text,p_operational_branch_id,'operational_branch_changed',
      'Staff operational branch changed.',
      jsonb_build_object(
        'activityScope','staff_runtime',
        'sessionId',v_session_id,
        'scheduledBranchId',p_scheduled_branch_id,
        'previousOperationalBranchId',v_previous_operational,
        'operationalBranchId',p_operational_branch_id
      )
    );
  end if;

  return jsonb_build_object(
    'sessionId',v_session_id,
    'scheduledBranchId',p_scheduled_branch_id,
    'operationalBranchId',p_operational_branch_id,
    'operationalDate',p_operational_date,
    'updatedAt',now()
  );
end;
$function$;

revoke execute on function public.set_staff_runtime_context(text,text,date) from public, anon;
grant execute on function public.set_staff_runtime_context(text,text,date) to authenticated;
