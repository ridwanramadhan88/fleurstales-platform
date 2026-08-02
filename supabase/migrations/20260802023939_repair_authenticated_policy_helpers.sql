-- RLS policies execute as the querying role. These two narrow SECURITY DEFINER
-- helpers expose only the current staff employee id or a boolean permission
-- decision, and are required by staff operations and attendance Storage RLS.

begin;

revoke execute on function private.current_staff_employee_id() from public, anon;
grant execute on function private.current_staff_employee_id() to authenticated;

revoke execute on function private.has_action_permission(text) from public, anon;
grant execute on function private.has_action_permission(text) to authenticated;

commit;
