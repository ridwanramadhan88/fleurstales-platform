-- Manual customer tracking must require both Order Number and WhatsApp.
-- `verify_order_tracking_access` is the public gate. The older order-number-only
-- summary RPC would otherwise expose status/schedule data without the second
-- customer factor, so keep it available to service tooling only.

begin;

revoke execute on function public.search_order_public_status(text) from public, anon, authenticated;
grant execute on function public.search_order_public_status(text) to service_role;

commit;
