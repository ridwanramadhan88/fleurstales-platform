-- Corrective: 20261018120000 upserted florist/customers='view', but the
-- guard_role_section_domain trigger clamped it to 'none' because Florist was
-- not eligible for the Customers section. Make Florist eligible (view only is
-- the default; Owner can still change it in Settings), then re-apply the row.
begin;

create or replace function private.section_role_eligible(p_role text,p_section text)
returns boolean
language sql
immutable
security definer
set search_path=''
as $$
  select case p_role
    when 'owner' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','hr','scheduling','settings')
    when 'admin' then p_section in ('dashboard','orders','stock','catalog','customers')
    when 'finance' then p_section in ('dashboard','orders','stock','catalog','customers','revenue','finance')
    when 'hr' then p_section in ('dashboard','orders','customers','hr','scheduling')
    when 'florist' then p_section in ('dashboard','customers')
    else false
  end
$$;
revoke execute on function private.section_role_eligible(text,text) from public,anon,authenticated;

insert into private.role_section_permissions(role, section, access_level, updated_at)
values ('florist', 'customers', 'view', now())
on conflict (role, section) do update
set access_level = excluded.access_level, updated_at = excluded.updated_at;

update private.authorization_state
set revision = revision + 1, updated_at = now()
where id = 'primary';

commit;
