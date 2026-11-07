-- Daily customer-birthday notification for every active Admin
-- (Owner request 6 Nov 2026). Runs 08:00 WIB (01:00 UTC) via pg_cron.
-- * One notification per customer per day (safe to run twice: a customer
--   notified in the last 20 hours is skipped).
-- * Born 29 Feb -> notified 28 Feb in non-leap years.
-- * Opens the Customers section in the OS.

begin;

CREATE OR REPLACE FUNCTION private.notification_kind_allowed_for_role(p_role text, p_kind text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_kind='authorization_changed' then return p_role is not null; end if;
  -- Owner request 6 Nov 2026: customer birthdays go to every Admin.
  if p_kind='customer_birthday' then return p_role='admin'; end if;

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
$function$;

create or replace function private.notify_customer_birthdays(p_date date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_date date := coalesce(p_date, timezone('Asia/Jakarta', now())::date);
  v_leap boolean;
  v_customer record;
  v_total integer := 0;
begin
  v_leap := (extract(year from v_date)::int % 4 = 0 and extract(year from v_date)::int % 100 <> 0)
            or extract(year from v_date)::int % 400 = 0;
  for v_customer in
    select c.id, c.name, c.whatsapp_number, c.preferred_branch_id
    from public.customers c
    where c.birthday is not null
      and (
        (extract(month from c.birthday) = extract(month from v_date) and extract(day from c.birthday) = extract(day from v_date))
        or (not v_leap and extract(month from v_date) = 2 and extract(day from v_date) = 28
            and extract(month from c.birthday) = 2 and extract(day from c.birthday) = 29)
      )
      and not exists (
        select 1 from public.staff_notifications n
        where n.kind = 'customer_birthday' and n.entity_id = c.id
          and n.created_at > now() - interval '20 hours'
      )
    order by c.name
  loop
    v_total := v_total + private.notify_roles(
      array['admin'], null, 'customer_birthday', 'info',
      'Ulang tahun pelanggan hari ini',
      concat_ws(' · ', nullif(trim(v_customer.name), ''), nullif(trim(v_customer.whatsapp_number), '')),
      'customer', v_customer.id, 'customers', v_customer.id
    );
  end loop;
  return v_total;
end;
$$;
revoke execute on function private.notify_customer_birthdays(date) from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'notify-customer-birthdays';
select cron.schedule(
  'notify-customer-birthdays',
  '0 1 * * *',
  $job$select private.notify_customer_birthdays()$job$
);

commit;
