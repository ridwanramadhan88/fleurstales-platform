-- Allow the public Storefront branch query to select and order by sort_order.
-- Row access remains restricted to active branches by branches_public_read_active.

begin;

grant select (sort_order) on public.branches to anon;

commit;
