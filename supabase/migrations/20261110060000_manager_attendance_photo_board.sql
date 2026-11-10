-- M2: the manager sees who checked in, when, and the check-in selfie, per day.
-- View only: no correction, no review decision, no coordinates.

begin;

create or replace function public.get_attendance_photo_board(p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not (private.current_staff_role() = 'manager' or private.has_action_permission('hr.review_attendance')) then
    raise exception 'ATTENDANCE_BOARD_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  if p_date is null or p_date > v_today or p_date < v_today - 62 then
    raise exception 'ATTENDANCE_BOARD_DATE_INVALID' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'employeeId', sap.employee_id,
      'displayName', sap.display_name,
      'role', sap.role,
      'scheduled', o.shift is not null,
      'isWorking', coalesce((o.shift->>'isWorking')::boolean, false),
      'scheduledBranchId', o.shift->>'branchId',
      'shiftStart', o.shift->>'startTime',
      'shiftEnd', o.shift->>'endTime',
      'status', a.status,
      'source', a.record->>'source',
      'checkInAt', a.record->>'checkInAt',
      'checkOutAt', a.record->>'checkOutAt',
      'checkInBranchName', a.record->'checkInLocation'->>'detectedBranchName',
      'checkInPhotoPath', case when left(coalesce(a.record->>'selfieDataUrl', ''), 5) in ('', 'data:') then null else a.record->>'selfieDataUrl' end,
      'checkOutPhotoPath', case when left(coalesce(a.record->>'checkOutSelfieDataUrl', ''), 5) in ('', 'data:') then null else a.record->>'checkOutSelfieDataUrl' end
    ) order by coalesce(o.shift->>'branchId', a.record->'checkInLocation'->>'detectedBranchName', sap.branch_id, ''), sap.display_name)
    from public.staff_access_profiles sap
    left join public.staff_schedule_overrides o on o.employee_id = sap.employee_id and o.schedule_date = p_date
    left join public.staff_attendance_records a on a.employee_id = sap.employee_id and a.attendance_date = p_date
    where sap.is_active = true
      and sap.role in ('admin', 'florist', 'courier', 'manager')
      and sap.employee_id is not null
  ), '[]'::jsonb);
end;
$function$;

revoke execute on function public.get_attendance_photo_board(date) from public, anon;
grant execute on function public.get_attendance_photo_board(date) to authenticated;

-- The selfies themselves: own photos, attendance reviewers, and now the manager (read only).
drop policy if exists attendance_selfies_select on storage.objects;
create policy attendance_selfies_select on storage.objects
for select to authenticated
using (
  bucket_id = 'attendance-selfies'
  and (
    (storage.foldername(name))[1] = private.current_staff_employee_id()
    or private.has_action_permission('hr.review_attendance')
    or private.current_staff_role() = 'manager'
  )
);

commit;
