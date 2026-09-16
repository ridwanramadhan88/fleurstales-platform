begin;

-- Batch 2 variant flow can replace the selected variant on an existing order
-- line. The snapshot function already preserves historical data when the
-- variant is unchanged and rebuilds it when variant_id changes; wire that
-- behavior to UPDATE as well as INSERT.
drop trigger if exists trg_order_items_snapshot_flower_recipe on public.order_items;

create trigger trg_order_items_snapshot_flower_recipe
before insert or update of variant_id on public.order_items
for each row
execute function private.snapshot_order_item_flower_recipe();

comment on trigger trg_order_items_snapshot_flower_recipe on public.order_items is
  'Snapshots the selected variant recipe at insert time and refreshes it only when variant_id changes.';

commit;
