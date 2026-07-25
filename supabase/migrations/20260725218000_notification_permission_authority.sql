-- Fleurstales V3.2 notification permission authority.
-- Notifications must not become a side-channel around Owner-configured access.
-- Recipient creation and later reads both re-check the current backend matrix.

begin;

create or replace function private.notification_kind_allowed_for_role(p_role text,p_kind text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if p_kind='authorization_changed' then return p_role is not null; end if;

  if p_kind in ('order_received','finance_rejected','order_change_resolved') then
    return private.has_action_permission_for_role(p_role,'orders.read_all');
  end if;
  if p_kind='order_assigned' then
    return private.has_action_permission_for_role(p_role,'orders.read_assigned')
      or private.has_action_permission_for_role(p_role,'orders.read_all');
  end if;
  if p_kind in ('order_pending_verification','admin_resubmitted') then
    return private.has_action_permission_for_role(p_role,'finance.verify_order');
  end if;
  if p_kind='order_change_requested' then
    return private.has_action_permission_for_role(p_role,'orders.resolve_change_request');
  end if;

  if p_kind='payroll_submitted' then
    return private.has_action_permission_for_role(p_role,'finance.view_payroll');
  end if;
  if p_kind in ('payroll_rejected','payroll_approved','payroll_paid') then
    return private.has_action_permission_for_role(p_role,'hr.create_payroll_proposal')
      or private.has_action_permission_for_role(p_role,'hr.edit_payroll_proposal')
      or private.has_action_permission_for_role(p_role,'hr.resolve_rejected_employee');
  end if;

  return false;
end;
$$;
revoke execute on function private.notification_kind_allowed_for_role(text,text) from public,anon,authenticated;

create or replace function private.can_read_staff_notification(p_notification public.staff_notifications)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
begin
  if (select auth.uid()) is null or p_notification.recipient_user_id <> (select auth.uid()) then
    return false;
  end if;
  select * into v_profile
  from public.staff_access_profiles
  where user_id=(select auth.uid()) and is_active=true
  limit 1;
  if not found then return false; end if;
  return private.notification_kind_allowed_for_role(v_profile.role,p_notification.kind);
end;
$$;
revoke execute on function private.can_read_staff_notification(public.staff_notifications) from public,anon,authenticated;
grant execute on function private.can_read_staff_notification(public.staff_notifications) to authenticated;

drop policy if exists staff_notifications_own_read on public.staff_notifications;
create policy staff_notifications_own_read on public.staff_notifications
for select to authenticated
using (private.can_read_staff_notification(staff_notifications));

create or replace function private.notify_roles(
  p_roles text[],
  p_branch_id text,
  p_kind text,
  p_severity text,
  p_title text,
  p_message text,
  p_entity_type text,
  p_entity_id text,
  p_target text,
  p_target_id text default null
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer;
begin
  insert into public.staff_notifications(
    recipient_user_id,recipient_employee_id,kind,severity,title,message,
    branch_id,entity_type,entity_id,target,target_id
  )
  select
    sap.user_id,sap.employee_id,p_kind,p_severity,p_title,p_message,
    p_branch_id,p_entity_type,p_entity_id,p_target,p_target_id
  from public.staff_access_profiles sap
  where sap.is_active=true
    and sap.role=any(p_roles)
    and private.notification_kind_allowed_for_role(sap.role,p_kind)
    and (p_branch_id is null or sap.role in ('owner','finance','hr') or sap.branch_id=p_branch_id)
    and sap.user_id is distinct from (select auth.uid());

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function private.notify_employee(
  p_employee_id text,
  p_kind text,
  p_severity text,
  p_title text,
  p_message text,
  p_branch_id text,
  p_entity_type text,
  p_entity_id text,
  p_target text,
  p_target_id text default null
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_count integer;
begin
  if p_employee_id is null then return 0; end if;
  insert into public.staff_notifications(
    recipient_user_id,recipient_employee_id,kind,severity,title,message,
    branch_id,entity_type,entity_id,target,target_id
  )
  select
    sap.user_id,sap.employee_id,p_kind,p_severity,p_title,p_message,
    p_branch_id,p_entity_type,p_entity_id,p_target,p_target_id
  from public.staff_access_profiles sap
  where sap.is_active=true
    and sap.employee_id=p_employee_id
    and private.notification_kind_allowed_for_role(sap.role,p_kind)
    and sap.user_id is distinct from (select auth.uid());

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke execute on function private.notify_roles(text[],text,text,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke execute on function private.notify_employee(text,text,text,text,text,text,text,text,text,text) from public,anon,authenticated;

-- Finance activity visibility follows the explicit ledger-view capability.
create or replace function private.can_read_business_activity(p_activity public.business_activities)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if private.current_staff_role()='owner' then return true; end if;

  if p_activity.entity_type='order' and p_activity.entity_id is not null then
    return exists(
      select 1 from public.orders o
      where o.id=p_activity.entity_id
        and private.can_read_order_row(o.branch_id,o.florist_assigned_employee_id)
    );
  end if;
  if p_activity.entity_type='payroll' then
    return private.has_action_permission('finance.view_payroll')
      or private.has_action_permission('hr.create_payroll_proposal')
      or private.has_action_permission('hr.edit_payroll_proposal')
      or private.has_action_permission('hr.resolve_rejected_employee');
  end if;
  if p_activity.entity_type='authorization' then
    return private.has_action_permission('settings.edit_permissions');
  end if;
  if p_activity.entity_type='customer' then return private.has_section_access('customers','view'); end if;
  if p_activity.entity_type='finance' then return private.has_action_permission('finance.view_ledger'); end if;
  if p_activity.entity_type='hr' then return private.has_section_access('hr','view'); end if;
  if p_activity.entity_type='stock' then return private.feature_enabled('inventory') and private.has_section_access('stock','view'); end if;
  return false;
end;
$$;
revoke execute on function private.can_read_business_activity(public.business_activities) from public,anon,authenticated;
grant execute on function private.can_read_business_activity(public.business_activities) to authenticated;

commit;
