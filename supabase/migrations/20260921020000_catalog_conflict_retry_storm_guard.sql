-- Catalog revision conflicts must reach the browser exactly once.
--
-- Production incident (2026-09-30/10-01): a stale browser tab kept saving the Catalog with
-- an old revision. The writers raise SQLSTATE 40001, which PostgREST retries inside the
-- server, so each stale request became thousands of executions. That saturated PostgREST's
-- 10-connection pool, which broke Auth/Storefront/OS sign-in (PGRST002/PGRST003).
--
-- Fix, following the existing *_guarded convention (see 20260903224701 / 20260906064632):
--   1. Current clients call *_guarded wrappers.
--   2. The wrapper rejects a stale revision with a cheap, lock-free read BEFORE any
--      validation or row lock, and reports it as PT409 (HTTP 409, never retried).
--   3. Any 40001 raised by the inner writer is also converted to PT409.
--   4. The retired names are revoked from `authenticated`, so already-open stale tabs fail
--      at the permission check before the JSON payload is decoded.
-- The inner writers and their authorization checks are unchanged.

create or replace function public.replace_catalog_snapshot_guarded(
  p_base_revision bigint,
  p_occasions jsonb,
  p_products jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_revision bigint;
begin
  select s.revision into v_current_revision
  from public.catalog_sync_state s
  where s.id = 'primary';

  if v_current_revision is not null and p_base_revision is distinct from v_current_revision then
    raise exception using errcode = 'PT409',
      message = format('CATALOG_CONFLICT: expected revision %s, current revision %s.', p_base_revision, v_current_revision),
      hint = 'Reload the latest Catalog before saving again.';
  end if;

  return public.replace_catalog_snapshot(p_base_revision, p_occasions, p_products);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest Catalog before saving again.';
end;
$$;

create or replace function public.replace_catalog_flower_recipes_guarded(
  p_base_revision bigint,
  p_products jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_revision bigint;
begin
  select s.revision into v_current_revision
  from public.catalog_sync_state s
  where s.id = 'primary';

  if v_current_revision is not null and p_base_revision is distinct from v_current_revision then
    raise exception using errcode = 'PT409',
      message = format('CATALOG_CONFLICT: expected revision %s, current revision %s.', p_base_revision, v_current_revision),
      hint = 'Reload the latest Catalog before saving again.';
  end if;

  return public.replace_catalog_flower_recipes(p_base_revision, p_products);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest Catalog before saving again.';
end;
$$;

create or replace function public.replace_product_images_metadata_guarded(
  p_base_revision bigint,
  p_product_id text,
  p_images jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_revision bigint;
begin
  select s.revision into v_current_revision
  from public.catalog_sync_state s
  where s.id = 'primary';

  if v_current_revision is not null and p_base_revision is distinct from v_current_revision then
    raise exception using errcode = 'PT409',
      message = format('CATALOG_CONFLICT: expected revision %s, current revision %s.', p_base_revision, v_current_revision),
      hint = 'Reload the latest Catalog before saving again.';
  end if;

  return public.replace_product_images_metadata(p_base_revision, p_product_id, p_images);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the latest Catalog before saving again.';
end;
$$;

revoke all on function public.replace_catalog_snapshot_guarded(bigint,jsonb,jsonb) from public, anon;
revoke all on function public.replace_catalog_flower_recipes_guarded(bigint,jsonb) from public, anon;
revoke all on function public.replace_product_images_metadata_guarded(bigint,text,jsonb) from public, anon;
grant execute on function public.replace_catalog_snapshot_guarded(bigint,jsonb,jsonb) to authenticated, service_role;
grant execute on function public.replace_catalog_flower_recipes_guarded(bigint,jsonb) to authenticated, service_role;
grant execute on function public.replace_product_images_metadata_guarded(bigint,text,jsonb) to authenticated, service_role;

-- Retired entrypoints: stale tabs are rejected by Postgres before the payload is decoded.
revoke execute on function public.replace_catalog_snapshot(bigint,jsonb,jsonb) from authenticated;
revoke execute on function public.replace_catalog_flower_recipes(bigint,jsonb) from authenticated;
revoke execute on function public.replace_product_images_metadata(bigint,text,jsonb) from authenticated;

notify pgrst, 'reload schema';
