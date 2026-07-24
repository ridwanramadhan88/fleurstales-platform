-- SECURITY DEFINER functions inherit EXECUTE for PUBLIC unless it is revoked
-- explicitly. Keep the customer checkout RPC public, while every staff RPC
-- remains limited to its previously granted authenticated role.
do $$
declare
  secured_function record;
begin
  for secured_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      secured_function.signature
    );
  end loop;
end
$$;

grant execute on function public.create_storefront_order(
  text, jsonb, text, text, date, time, jsonb, text, text, text, text, text, text, text
) to anon, authenticated;

-- Avoid duplicate authenticated SELECT policies. Public read already includes
-- authenticated users; staff write permissions are expressed per operation.
drop policy if exists size_guide_templates_editor_write on public.size_guide_templates;
create policy size_guide_templates_editor_insert on public.size_guide_templates
  for insert to authenticated
  with check (private.has_staff_role(array['Owner', 'Admin']));
create policy size_guide_templates_editor_update on public.size_guide_templates
  for update to authenticated
  using (private.has_staff_role(array['Owner', 'Admin']))
  with check (private.has_staff_role(array['Owner', 'Admin']));
create policy size_guide_templates_editor_delete on public.size_guide_templates
  for delete to authenticated
  using (private.has_staff_role(array['Owner', 'Admin']));

drop policy if exists size_guide_targets_editor_write on public.size_guide_targets;
create policy size_guide_targets_editor_insert on public.size_guide_targets
  for insert to authenticated
  with check (private.has_staff_role(array['Owner', 'Admin']));
create policy size_guide_targets_editor_update on public.size_guide_targets
  for update to authenticated
  using (private.has_staff_role(array['Owner', 'Admin']))
  with check (private.has_staff_role(array['Owner', 'Admin']));
create policy size_guide_targets_editor_delete on public.size_guide_targets
  for delete to authenticated
  using (private.has_staff_role(array['Owner', 'Admin']));

-- Cover all foreign keys reported by the post-migration performance advisor.
create index if not exists idx_catalog_tombstones_deleted_by
  on public.catalog_product_code_tombstones(deleted_by);
create index if not exists idx_catalog_sync_state_updated_by
  on public.catalog_sync_state(updated_by);
create index if not exists idx_customers_preferred_branch
  on public.customers(preferred_branch_id);
create index if not exists idx_order_items_variant
  on public.order_items(variant_id);
create index if not exists idx_size_guide_targets_template
  on public.size_guide_targets(template_id);
create index if not exists idx_store_sync_state_updated_by
  on public.store_sync_state(updated_by);
