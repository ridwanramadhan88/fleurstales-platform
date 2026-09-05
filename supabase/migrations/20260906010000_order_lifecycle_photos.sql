-- Bootstrap the order lifecycle media schema and Storage buckets.
-- Authorization, lifecycle guards, tracking behavior, and write policies are
-- installed by the immediately-following hardening migrations. Keep this first
-- step fail-closed so a release interrupted between migrations never exposes
-- transfer proof evidence publicly or enables a partially-authorized upload.

begin;

alter table public.orders
  add column if not exists finish_photo_url text,
  add column if not exists finish_photo_uploaded_by text,
  add column if not exists finish_photo_uploaded_at timestamptz,
  add column if not exists payment_proof_url text;

-- Finished-order photos are deliberately customer-visible on secure tracking.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-finish-photos',
  'order-finish-photos',
  true,
  102400,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Transfer proofs are internal Finance evidence. They are private from the
-- first migration onward; the later hardening migration adds authorized
-- Owner/Admin writes and Finance-only reads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-payment-proofs',
  'order-payment-proofs',
  false,
  307200,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Do not install permissive bootstrap Storage policies here. The next
-- hardening migration ties every write to the authoritative order, staff
-- capability, and Admin runtime branch before uploads are enabled.

commit;
