-- Order Lifecycle & Progress UX: mandatory finish photo + bukti transfer
-- payment proof. Adds the two order columns, two public Storage buckets
-- (mirroring the existing `product-images` bucket exactly), and re-exposes
-- `finishPhotoUrl` + a 14-day expiry window on the public tracking RPC so a
-- shared `/track/...` link stops resolving two weeks after the order was
-- placed.

begin;

alter table public.orders
  add column if not exists finish_photo_url text,
  add column if not exists finish_photo_uploaded_by text,
  add column if not exists finish_photo_uploaded_at timestamptz,
  add column if not exists payment_proof_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-finish-photos', 'order-finish-photos', true, 102400, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-payment-proofs', 'order-payment-proofs', true, 307200, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Both buckets are public-read (served straight off the Storage CDN, no RLS
-- round trip) — only Owner/Admin may write, matching the 'status' / 'payment'
-- order-mutation authorization tier these uploads are always attached to.
create policy order_finish_photos_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'order-finish-photos' and private.has_staff_role(array['owner','admin']));
create policy order_finish_photos_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'order-finish-photos' and private.has_staff_role(array['owner','admin']))
with check (bucket_id = 'order-finish-photos' and private.has_staff_role(array['owner','admin']));
create policy order_finish_photos_storage_delete on storage.objects
for delete to authenticated
using (bucket_id = 'order-finish-photos' and private.has_staff_role(array['owner','admin']));

create policy order_payment_proofs_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'order-payment-proofs' and private.has_staff_role(array['owner','admin']));
create policy order_payment_proofs_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'order-payment-proofs' and private.has_staff_role(array['owner','admin']))
with check (bucket_id = 'order-payment-proofs' and private.has_staff_role(array['owner','admin']));
create policy order_payment_proofs_storage_delete on storage.objects
for delete to authenticated
using (bucket_id = 'order-payment-proofs' and private.has_staff_role(array['owner','admin']));

-- Re-create the public tracking RPC (latest body, from
-- 20260904193000_finance_cashflow_tracking_reviews.sql) with finishPhotoUrl
-- added to the payload and a 14-day link expiry: a `/track/...` link is
-- valid for two weeks from order placement, after which this returns null
-- and the storefront shows an "expired" state instead of order details.
create or replace function public.get_order_public_status(p_tracking_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracking_id uuid;
  v_result jsonb;
begin
  perform private.consume_public_order_lookup_budget();
  begin v_tracking_id:=p_tracking_id::uuid; exception when invalid_text_representation then return null; end;

  select jsonb_build_object(
    'orderNumber',o.order_number,
    'status',o.status,
    'fulfillment',o.fulfillment,
    'branchId',o.branch_id,
    'branchName',b.name,
    'branchAddress',b.address,
    'customerName',o.customer_name_snapshot,
    'customerWhatsapp',o.customer_whatsapp_snapshot,
    'contactWhatsapp',sp.whatsapp,
    'deliveryAddress',o.delivery_address,
    'deliveryInstructions',o.delivery_instructions,
    'scheduleDate',o.schedule_date,
    'scheduleTime',o.schedule_time,
    'requestedPickupDate',o.requested_pickup_date,
    'requestedPickupTime',o.requested_pickup_time,
    'paymentStatus',o.payment_status,
    'paymentMethod',o.payment_method,
    'paymentAccountSnapshot',o.payment_account_snapshot,
    'itemsSubtotalIdr',o.items_subtotal_idr,
    'deliveryFeeIdr',o.delivery_fee_idr,
    'discountIdr',o.discount_idr,
    'totalIdr',o.total_idr,
    'cancellationReason',o.cancellation_reason,
    'finishPhotoUrl',o.finish_photo_url,
    'reviewSubmitted',exists(select 1 from private.order_reviews r where r.order_id=o.id),
    'reviewQuestions',case when o.status in ('delivered','picked_up') and not exists(select 1 from private.order_reviews r where r.order_id=o.id) then
      coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'displayOrder',q.display_order) order by q.display_order,q.id) from private.review_questions q where q.is_active=true),'[]'::jsonb)
      else '[]'::jsonb end,
    'review',(select jsonb_build_object(
      'note',r.note,'submittedAt',r.submitted_at,
      'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'question',a.question_snapshot,'score',a.score) order by a.question_id) from private.order_review_answers a where a.review_id=r.id),'[]'::jsonb)
    ) from private.order_reviews r where r.order_id=o.id limit 1),
    'reviewReward',(select jsonb_build_object('percentOff',rw.percent_off,'minOrderIdr',rw.min_order_idr,'status',rw.status,'issuedAt',rw.issued_at,'redeemedAt',rw.redeemed_at) from private.customer_review_rewards rw where rw.source_order_id=o.id limit 1),
    'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name_snapshot,'variant',i.variant_size_snapshot,'quantity',i.quantity,'unitPriceIdr',i.unit_price_idr) order by i.created_at,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb)
  ) into v_result
  from public.orders o
  left join public.branches b on b.id=o.branch_id
  left join public.store_profile sp on sp.id='primary'
  where o.public_tracking_id=v_tracking_id
    and o.source='customer_app'
    and o.created_at >= now() - interval '14 days'
  limit 1;
  return v_result;
end;
$$;
revoke execute on function public.get_order_public_status(text) from public, authenticated;
grant execute on function public.get_order_public_status(text) to anon, service_role;

commit;
