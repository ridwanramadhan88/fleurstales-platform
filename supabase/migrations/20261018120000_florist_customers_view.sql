-- Florists can view the same customer records as Admin (read-only).
-- Editing customers stays with Owner/Admin; the Owner can still change this in Settings.
begin;

insert into private.role_section_permissions(role, section, access_level, updated_at)
values ('florist', 'customers', 'view', now())
on conflict (role, section) do update
set access_level = excluded.access_level, updated_at = excluded.updated_at;

update private.authorization_state
set revision = revision + 1, updated_at = now()
where id = 'primary';

commit;
