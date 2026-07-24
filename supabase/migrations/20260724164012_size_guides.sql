begin;

create table if not exists public.size_guide_templates (
  id text primary key,
  name text not null check (length(trim(name)) between 1 and 120),
  storage_path text not null unique,
  mime_type text not null default 'image/jpeg' check (mime_type = 'image/jpeg'),
  byte_size integer not null check (byte_size between 1 and 102400),
  width integer not null default 800 check (width = 800),
  height integer not null default 800 check (height = 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.size_guide_targets (
  id text primary key,
  template_id text not null references public.size_guide_templates(id) on delete cascade,
  scope text not null check (scope in ('product_type', 'product')),
  product_type text,
  product_id text references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint size_guide_target_shape check (
    (scope = 'product_type' and length(trim(product_type)) > 0 and product_id is null)
    or (scope = 'product' and product_id is not null and product_type is null)
  )
);

create unique index if not exists uq_size_guide_target_product_type
  on public.size_guide_targets(product_type) where scope = 'product_type';
create unique index if not exists uq_size_guide_target_product
  on public.size_guide_targets(product_id) where scope = 'product';

alter table public.size_guide_templates enable row level security;
alter table public.size_guide_targets enable row level security;

revoke all on table public.size_guide_templates from anon, authenticated;
revoke all on table public.size_guide_targets from anon, authenticated;
grant select on public.size_guide_templates to anon, authenticated;
grant select on public.size_guide_targets to anon, authenticated;
grant insert, update, delete on public.size_guide_templates to authenticated;
grant insert, update, delete on public.size_guide_targets to authenticated;

drop policy if exists size_guide_templates_public_read on public.size_guide_templates;
create policy size_guide_templates_public_read on public.size_guide_templates
for select to anon, authenticated using (true);
drop policy if exists size_guide_templates_editor_write on public.size_guide_templates;
create policy size_guide_templates_editor_write on public.size_guide_templates
for all to authenticated
using (private.has_staff_role(array['owner','admin']))
with check (private.has_staff_role(array['owner','admin']));

drop policy if exists size_guide_targets_public_read on public.size_guide_targets;
create policy size_guide_targets_public_read on public.size_guide_targets
for select to anon, authenticated using (true);
drop policy if exists size_guide_targets_editor_write on public.size_guide_targets;
create policy size_guide_targets_editor_write on public.size_guide_targets
for all to authenticated
using (private.has_staff_role(array['owner','admin']))
with check (private.has_staff_role(array['owner','admin']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('size-guides', 'size-guides', true, 102400, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists size_guides_storage_staff_select on storage.objects;
create policy size_guides_storage_staff_select on storage.objects
for select to authenticated
using (bucket_id = 'size-guides' and private.has_staff_role(array['owner','admin']));
drop policy if exists size_guides_storage_insert on storage.objects;
create policy size_guides_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'size-guides' and private.has_staff_role(array['owner','admin']));
drop policy if exists size_guides_storage_update on storage.objects;
create policy size_guides_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'size-guides' and private.has_staff_role(array['owner','admin']))
with check (bucket_id = 'size-guides' and private.has_staff_role(array['owner','admin']));
drop policy if exists size_guides_storage_delete on storage.objects;
create policy size_guides_storage_delete on storage.objects
for delete to authenticated
using (bucket_id = 'size-guides' and private.has_staff_role(array['owner','admin']));

create or replace function public.replace_size_guide_library(
  p_templates jsonb,
  p_targets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template jsonb;
  v_target jsonb;
  v_role text;
begin
  v_role := private.current_staff_role();
  if v_role is null or not (v_role = any(array['owner','admin'])) then
    raise exception 'Owner or Admin catalog access is required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_templates) <> 'array' or jsonb_typeof(p_targets) <> 'array' then
    raise exception 'Size guide templates and targets must be JSON arrays.' using errcode = '22023';
  end if;

  delete from public.size_guide_targets;
  delete from public.size_guide_templates;

  for v_template in select value from jsonb_array_elements(p_templates)
  loop
    insert into public.size_guide_templates (
      id, name, storage_path, mime_type, byte_size, width, height, created_at, updated_at
    ) values (
      v_template->>'id',
      trim(v_template->>'name'),
      v_template->>'storagePath',
      coalesce(v_template->>'mimeType', 'image/jpeg'),
      (v_template->>'byteSize')::integer,
      (v_template->>'width')::integer,
      (v_template->>'height')::integer,
      coalesce((v_template->>'createdAt')::timestamptz, now()),
      coalesce((v_template->>'updatedAt')::timestamptz, now())
    );
  end loop;

  for v_target in select value from jsonb_array_elements(p_targets)
  loop
    insert into public.size_guide_targets (
      id, template_id, scope, product_type, product_id
    ) values (
      v_target->>'id',
      v_target->>'templateId',
      v_target->>'scope',
      nullif(v_target->>'productType', ''),
      nullif(v_target->>'productId', '')
    );
  end loop;

  return jsonb_build_object(
    'templateCount', jsonb_array_length(p_templates),
    'targetCount', jsonb_array_length(p_targets)
  );
end;
$$;

revoke all on function public.replace_size_guide_library(jsonb, jsonb) from public;
grant execute on function public.replace_size_guide_library(jsonb, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'size_guide_templates'
  ) then
    alter publication supabase_realtime add table public.size_guide_templates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'size_guide_targets'
  ) then
    alter publication supabase_realtime add table public.size_guide_targets;
  end if;
end $$;

commit;
