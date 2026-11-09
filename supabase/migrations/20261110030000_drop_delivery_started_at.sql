-- D4b cleanup: delivery_started_at was only set by the removed courier "start"
-- action. delivery_shipped_at (set when Admin saves the shipment) covers it.
alter table public.orders drop column if exists delivery_started_at;
