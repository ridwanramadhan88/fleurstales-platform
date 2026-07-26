begin;

-- Supabase's production safe-update guard rejects DELETE statements without
-- an explicit predicate, including intentional full replacement operations.
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
begin
  if not private.has_section_access('catalog','edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_templates) <> 'array' or jsonb_typeof(p_targets) <> 'array' then
    raise exception 'Size guide templates and targets must be JSON arrays.' using errcode = '22023';
  end if;

  delete from public.size_guide_targets where id is not null;
  delete from public.size_guide_templates where id is not null;

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

revoke execute on function public.replace_size_guide_library(jsonb, jsonb)
  from public, anon;
grant execute on function public.replace_size_guide_library(jsonb, jsonb)
  to authenticated;

commit;
