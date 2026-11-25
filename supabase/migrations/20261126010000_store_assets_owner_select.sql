-- 26 Nov 2026: Storage deletes in `store-assets` silently did nothing.
--
-- The bucket is public (files load by public URL), but it never had a SELECT
-- policy. Storage deletes with `DELETE ... RETURNING`, and Postgres skips rows
-- the caller cannot select, so Owner deletes answered 200 with an empty list
-- and left the file in place (seen with the legacy static QRIS images).
--
-- Let the Owner see the bucket's objects, matching the existing
-- insert/update/delete policies. Public URL reads are unaffected.

drop policy if exists store_assets_storage_owner_select on storage.objects;
create policy store_assets_storage_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'store-assets' and private.has_staff_role(array['owner']));
