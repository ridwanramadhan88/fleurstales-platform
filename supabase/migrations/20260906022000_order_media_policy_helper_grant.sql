-- Storage RLS policies execute private.can_write_order_media_object(name) as the
-- authenticated caller. Keep the helper hidden from anon/public, but grant
-- authenticated EXECUTE so the policy expression itself can be evaluated.
-- The SECURITY DEFINER helper returns only a boolean and still enforces staff
-- role, orders.advance_status capability, order identity, and Admin runtime
-- branch scope internally.

begin;

revoke execute on function private.can_write_order_media_object(text)
  from public, anon;
grant execute on function private.can_write_order_media_object(text)
  to authenticated;

commit;
