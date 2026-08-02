-- The aggregate operational_state table is retired. Keep it temporarily for
-- recovery inspection, but remove all browser/API authority.
revoke all privileges on table public.operational_state from anon, authenticated;

-- Arrangement types remain publicly readable; browser roles do not need
-- schema-changing table privileges.
revoke references, trigger, truncate on table public.arrangement_types from anon, authenticated;
