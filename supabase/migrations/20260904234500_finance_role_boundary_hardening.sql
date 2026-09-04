-- Production smoke hardening: Finance is a Finance-role-only workspace.
-- Keep the server eligibility registry aligned with the OS authorization contract,
-- not only the persisted role-permission rows.

begin;

create or replace function private.section_role_eligible(p_role text, p_section text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_role
    when 'owner' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','hr','scheduling','settings')
    when 'admin' then p_section in ('dashboard','orders','stock','catalog','customers')
    when 'finance' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','finance')
    when 'hr' then p_section in ('dashboard','hr','scheduling')
    when 'florist' then p_section='dashboard'
    else false
  end
$$;
revoke execute on function private.section_role_eligible(text,text) from public, anon, authenticated;

-- Finance capabilities are hard-eligible for Finance only. The legacy
-- finance.verify_order capability is retired entirely; Process Order now posts
-- the verified payment transaction directly.
update private.action_capability_registry
set allowed_roles = case
  when capability = 'finance.verify_order' then array[]::text[]
  else array['finance']::text[]
end
where capability like 'finance.%';

-- Clean stale persisted grants so the configuration returned to the OS matches
-- the hard eligibility boundary as well.
update private.role_section_permissions
set access_level = 'none', updated_at = clock_timestamp()
where role <> 'finance' and section = 'finance';

update private.role_action_permissions
set enabled = false
where role <> 'finance' and capability like 'finance.%';

update private.role_action_permissions
set enabled = false
where capability = 'finance.verify_order';

update private.authorization_state
set revision = revision + 1,
    updated_at = clock_timestamp()
where id = 'primary';

commit;
