-- Retired Catalog writers must not be reachable by browser roles at all.
--
-- 20260921020000 moved browser saves to the *_guarded wrappers and revoked the retired
-- names from `authenticated`. Supabase's default privileges also grant EXECUTE on new
-- public functions to `anon` explicitly, and `revoke ... from public` does not remove that
-- grant. replace_catalog_flower_recipes(bigint,jsonb) kept it from 20260909101000 onward.
-- Its first statement rejects callers without Catalog edit access, so no write was possible,
-- but a SECURITY DEFINER writer should not be an anonymous entrypoint.
--
-- Revoke `anon` on all three retired names so the intent is explicit and idempotent.
-- The inner writers stay callable by the guarded wrappers (SECURITY DEFINER, owner postgres).

revoke execute on function public.replace_catalog_snapshot(bigint,jsonb,jsonb) from anon;
revoke execute on function public.replace_catalog_flower_recipes(bigint,jsonb) from anon;
revoke execute on function public.replace_product_images_metadata(bigint,text,jsonb) from anon;

notify pgrst, 'reload schema';
