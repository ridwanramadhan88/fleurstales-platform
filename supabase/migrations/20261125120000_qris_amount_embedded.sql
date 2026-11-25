-- Amount-embedded QRIS per order (Q3, Owner decisions 25 Nov 2026).
--
-- * QRIS amount = the largest amount <= the bill that ends in the order's
--   3-digit daily code (KDM-26-11-26-007 -> ...007). The difference (0-999)
--   is a discount ("potongan kode unik"), never a surcharge. Bills under
--   Rp10.000, legacy numbers and 4-digit sequences are paid exactly.
-- * The server builds the dynamic QRIS string per order from the branch's
--   private static source; apps only receive that order's string.
-- * Shown only while the QRIS order is unpaid and not cancelled/failed.
-- * When the bill changes after the QR was handed out, the order shows
--   "QR diperbarui" until Admin marks the new QR as sent.
-- * Admin-created orders can use QRIS too (paymentChannel = 'qris').
-- * On payment confirmation the unique-code discount is applied so the
--   recorded payment equals the QRIS amount actually received.
-- * Proof of payment stays required (QRIS is recorded as a transfer).

begin;

alter table public.orders
  add column if not exists qris_amount_shown bigint check (qris_amount_shown is null or qris_amount_shown >= 0),
  add column if not exists qris_unique_discount_idr bigint not null default 0 check (qris_unique_discount_idr >= 0);

-- Release flag from the static-source migration: the amount-embedded QR ships now.
create or replace function private.qris_dynamic_ready()
returns boolean
language sql
immutable
set search_path = ''
as $$ select true $$;
revoke execute on function private.qris_dynamic_ready() from public, anon, authenticated;

-- QRIS amount for an order number and bill.
create or replace function private.qris_amount_for(p_order_number text, p_bill_idr bigint)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_code integer;
  v_amount bigint;
begin
  -- Small bills (< Rp10.000) are paid exactly; the code would be too large a share.
  if p_bill_idr is null or p_bill_idr < 10000 then
    return greatest(coalesce(p_bill_idr, 0), 0);
  end if;
  if coalesce(p_order_number, '') !~ '^[A-Z0-9]+-[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}$' then
    return p_bill_idr;
  end if;
  v_code := right(p_order_number, 3)::integer;
  v_amount := (p_bill_idr / 1000) * 1000 + v_code;
  if v_amount > p_bill_idr then
    v_amount := v_amount - 1000;
  end if;
  return v_amount;
end;
$$;
revoke execute on function private.qris_amount_for(text, bigint) from public, anon, authenticated;

create or replace function private.is_qris_order(p_order public.orders)
returns boolean
language sql
immutable
set search_path = ''
as $$ select coalesce(p_order.payment_account_snapshot->>'channel', '') = 'qris' $$;
revoke execute on function private.is_qris_order(public.orders) from public, anon, authenticated;

-- What an app may show for an order's QRIS payment; null when nothing to pay by QRIS.
create or replace function private.order_qris_payment(p_order public.orders)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bill bigint;
  v_amount bigint;
  v_source private.branch_qris_sources%rowtype;
  v_branch_name text;
begin
  if not private.is_qris_order(p_order)
     or not private.qris_dynamic_ready()
     or p_order.status in ('cancelled', 'failed')
     or p_order.payment_status <> 'unpaid' then
    return null;
  end if;
  select * into v_source from private.branch_qris_sources where branch_id = p_order.branch_id;
  if not found then
    return null;
  end if;
  v_bill := greatest(0, p_order.total_idr - p_order.paid_amount_idr);
  if v_bill < 1 then
    return null;
  end if;
  v_amount := private.qris_amount_for(p_order.order_number, v_bill);
  select name into v_branch_name from public.branches where id = p_order.branch_id;
  return jsonb_build_object(
    'payload', private.qris_dynamic_payload(v_source.payload, v_amount),
    'amountIdr', v_amount,
    'billIdr', v_bill,
    'uniqueDiscountIdr', v_bill - v_amount,
    'nmid', v_source.nmid,
    'branchName', v_branch_name,
    'amountUpdated', p_order.qris_amount_shown is not null and p_order.qris_amount_shown <> v_amount
  );
end;
$$;
revoke execute on function private.order_qris_payment(public.orders) from public, anon, authenticated;

-- The first QRIS amount handed out is remembered, so a later bill change
-- can be flagged ("QR diperbarui").
create or replace function private.remember_initial_qris_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_qris_order(new) and new.qris_amount_shown is null and new.order_number is not null then
    new.qris_amount_shown := private.qris_amount_for(new.order_number, greatest(0, new.total_idr - new.paid_amount_idr));
  end if;
  return new;
end;
$$;
revoke execute on function private.remember_initial_qris_amount() from public, anon, authenticated;

drop trigger if exists orders_remember_initial_qris_amount on public.orders;
create trigger orders_remember_initial_qris_amount
before insert or update of payment_account_snapshot on public.orders
for each row execute function private.remember_initial_qris_amount();

-- ---------------------------------------------------------------------------
-- Customer tracking: same details as before + qrisPayment.
-- ---------------------------------------------------------------------------
-- Latest definition (20261109020000_delivery_shipment) + qrisPayment.
CREATE OR REPLACE FUNCTION public.get_order_public_status(p_tracking_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tracking_id uuid;
  v_result jsonb;
begin
  perform private.consume_public_order_lookup_budget();
  begin
    v_tracking_id := p_tracking_id::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  select jsonb_build_object(
    'orderNumber',o.order_number,
    'status',o.status,
    'fulfillment',o.fulfillment,
    'branchId',o.branch_id,
    'branchName',b.name,
    'branchAddress',b.address,
    'customerName',coalesce(c.name,o.customer_name_snapshot),
    'customerWhatsapp',coalesce(c.whatsapp_number,o.customer_whatsapp_snapshot),
    'customerEmail',coalesce(c.email,o.customer_email_snapshot),
    'customerBirthday',c.birthday,
    'customerProfile',jsonb_strip_nulls(jsonb_build_object(
      'domicile',c.domicile,
      'ageRange',c.age_range,
      'gender',c.gender,
      'occupation',c.occupation,
      'acquisitionSource',c.acquisition_source,
      'promoPreferences',to_jsonb(c.promo_preferences)
    )),
    'contactWhatsapp',sp.whatsapp,
    'deliveryAddress',o.delivery_address,
    'deliveryInstructions',o.delivery_instructions,
    'recipientName',o.recipient_name,
    'recipientPhone',o.recipient_phone,
    'deliveryLandmark',o.delivery_landmark,
    'deliveryProvider',case when o.status in ('delivering','delivered') then o.delivery_provider end,
    'deliveryTrackingUrl',case when o.status = 'delivering' and o.delivery_provider = 'gojek' then o.delivery_tracking_url end,
    'deliveryLatitude',o.delivery_lat,
    'deliveryLongitude',o.delivery_lng,
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
    'qrisPayment',private.order_qris_payment(o),
    'reviewSubmitted',exists(select 1 from private.order_reviews r where r.order_id=o.id),
    'reviewQuestions',case
      when o.status in ('delivered','picked_up')
        and not exists(select 1 from private.order_reviews r where r.order_id=o.id)
      then coalesce((
        select jsonb_agg(
          jsonb_build_object('id',q.id,'question',q.question,'displayOrder',q.display_order)
          order by q.display_order,q.id
        )
        from private.review_questions q where q.is_active=true
      ),'[]'::jsonb)
      else '[]'::jsonb
    end,
    'review',(select jsonb_build_object(
      'note',r.note,
      'submittedAt',r.submitted_at,
      'surveyData',r.survey_data,
      'answers',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'questionId',a.question_id,
            'question',a.question_snapshot,
            'score',a.score
          ) order by a.question_id
        )
        from private.order_review_answers a where a.review_id=r.id
      ),'[]'::jsonb)
    ) from private.order_reviews r where r.order_id=o.id limit 1),
    'reviewReward',(select jsonb_build_object(
      'percentOff',case when coalesce(rw.amount_off_idr,0)>0 then null else rw.percent_off end,
      'amountOffIdr',rw.amount_off_idr,
      'minOrderIdr',rw.min_order_idr,
      'status',rw.status,
      'issuedAt',rw.issued_at,
      'redeemedAt',rw.redeemed_at
    ) from private.customer_review_rewards rw where rw.source_order_id=o.id limit 1),
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name',i.product_name_snapshot,
          'variant',i.variant_size_snapshot,
          'quantity',i.quantity,
          'unitPriceIdr',i.unit_price_idr
        ) order by i.created_at,i.id
      )
      from public.order_items i where i.order_id=o.id
    ),'[]'::jsonb)
  ) into v_result
  from public.orders o
  left join public.customers c on c.id=o.customer_id
  left join public.branches b on b.id=o.branch_id
  left join public.store_profile sp on sp.id='primary'
  where o.public_tracking_id=v_tracking_id
    and (o.tracking_expires_at is null or o.tracking_expires_at > now())
  limit 1;

  return v_result;
end;
$function$;
revoke execute on function public.get_order_public_status(text) from public, authenticated;
grant execute on function public.get_order_public_status(text) to anon, service_role;

-- ---------------------------------------------------------------------------
-- Staff: QR for an order, and "new QR sent".
-- ---------------------------------------------------------------------------
create or replace function public.get_order_qris_payment(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if (select auth.uid()) is null or not private.has_staff_role(array['owner','admin','finance']) then
    raise exception 'QRIS_NOT_PERMITTED' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  return private.order_qris_payment(v_order);
end;
$$;
revoke execute on function public.get_order_qris_payment(text) from public, anon;
grant execute on function public.get_order_qris_payment(text) to authenticated;

create or replace function public.mark_order_qris_sent(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment jsonb;
begin
  if (select auth.uid()) is null or not private.has_staff_role(array['owner','admin']) then
    raise exception 'QRIS_NOT_PERMITTED' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_payment := private.order_qris_payment(v_order);
  if v_payment is null then
    raise exception 'QRIS_PAYMENT_NOT_OPEN' using errcode = '22023';
  end if;
  update public.orders
  set qris_amount_shown = (v_payment->>'amountIdr')::bigint, updated_at = clock_timestamp()
  where id = v_order.id
  returning * into v_order;
  perform private.write_business_activity(
    'order', v_order.id, v_order.branch_id, 'qris_qr_sent',
    'New QRIS QR sent to the customer.',
    jsonb_build_object('orderNumber', v_order.order_number, 'amountIdr', v_order.qris_amount_shown)
  );
  return jsonb_build_object('orderId', v_order.id, 'revision', v_order.revision, 'qrisAmountShown', v_order.qris_amount_shown);
end;
$$;
revoke execute on function public.mark_order_qris_sent(text) from public, anon;
grant execute on function public.mark_order_qris_sent(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin-created orders paid by QRIS.
-- ---------------------------------------------------------------------------
-- Live definition + QRIS channel (paymentChannel = 'qris').
create or replace function public.create_internal_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_order public.orders%rowtype;
  v_qris boolean := lower(coalesce(p_payload->>'paymentChannel', '')) = 'qris';
  v_qris_account jsonb;
begin
  if coalesce(p_payload->>'paymentStatus','unpaid') <> 'unpaid'
     or coalesce((p_payload->>'depositAmountIdr')::bigint,0) <> 0 then
    raise exception 'PAYMENT_CONFIRMED_DURING_PROCESS_ORDER' using errcode='22023';
  end if;
  if v_qris then
    if coalesce(p_payload->>'paymentMethod', 'transfer') <> 'transfer' then
      raise exception 'QRIS_REQUIRES_TRANSFER' using errcode = '22023';
    end if;
    v_qris_account := private.storefront_qris_account(p_payload->>'branchId');
    if v_qris_account is null then
      raise exception 'QRIS_UNAVAILABLE' using errcode = '22023';
    end if;
  end if;

  v_result := public.create_internal_order_pre_cashflow(p_payload);

  if not coalesce((v_result->>'deduplicated')::boolean, false) then
    select * into v_order from public.orders where id = v_result->>'orderId';
    if found and v_order.fulfillment = 'delivery' then
      perform private.apply_order_delivery_details(
        v_order.id,
        p_payload->'deliveryDetails',
        jsonb_typeof(p_payload->'deliveryDetails') = 'object'
      );
      v_order := private.apply_order_delivery_fee(v_order.id, p_payload->'deliveryDetails');
      v_result := v_result || jsonb_build_object('deliveryFeeIdr', v_order.delivery_fee_idr, 'totalIdr', v_order.total_idr);
    end if;
    if found and v_qris then
      update public.orders
      set payment_method = 'transfer', payment_account_snapshot = v_qris_account, updated_at = now()
      where id = v_order.id;
    end if;
  end if;

  return v_result;
end;
$$;
revoke execute on function public.create_internal_order(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payment confirmation: apply the unique-code discount for QRIS.
-- (Same as the live definition, plus the QRIS block.)
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order_payment_with_proof(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text,
  p_payment_proof_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_proof text := nullif(trim(coalesce(p_payment_proof_path,'')),'');
  v_payment_revision integer;
  v_result jsonb;
  v_discount bigint := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode='P0002';
  end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_order.revision using errcode='40001';
  end if;
  if v_order.status <> 'confirmed' then
    raise exception 'ORDER_MUST_BE_CONFIRMED_BEFORE_PAYMENT_CONFIRMATION' using errcode='22023';
  end if;

  if v_order.payment_method = 'transfer' then
    if v_proof is null or v_proof not like v_order.id || '/proof-%.jpg' then
      raise exception 'PAYMENT_PROOF_REQUIRED_FOR_TRANSFER' using errcode='22023';
    end if;

    -- QRIS: the customer paid the amount-embedded QR (bill minus the
    -- unique-code discount); record that discount on the order.
    if private.is_qris_order(v_order) and v_order.payment_status = 'unpaid' then
      v_discount := greatest(0, (v_order.total_idr - v_order.paid_amount_idr)
        - private.qris_amount_for(v_order.order_number, greatest(0, v_order.total_idr - v_order.paid_amount_idr)));
      v_discount := least(v_discount, greatest(0, v_order.items_subtotal_idr - v_order.discount_idr));
    end if;

    update public.orders
    set payment_proof_url=v_proof,
        discount_idr=discount_idr + v_discount,
        total_idr=total_idr - v_discount,
        qris_unique_discount_idr=qris_unique_discount_idr + v_discount,
        updated_at=clock_timestamp()
    where id=v_order.id
    returning revision into v_payment_revision;

    if v_discount > 0 then
      perform private.write_business_activity(
        'order', v_order.id, v_order.branch_id, 'qris_unique_discount_applied',
        'QRIS unique-code discount applied.',
        jsonb_build_object('orderNumber', v_order.order_number, 'discountIdr', v_discount)
      );
    end if;
  elsif v_order.payment_method = 'cash' then
    if (v_order.source='customer_app' or (v_order.storefront_idempotency_key is not null and v_order.storefront_idempotency_key not like 'internal:%')) then
      raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode='22023';
    end if;
    v_proof := null;
    v_payment_revision := v_order.revision;
  else
    raise exception 'PAYMENT_METHOD_REQUIRED' using errcode='22023';
  end if;

  v_result := public.confirm_order_payment_for_processing(
    p_order_id,
    v_payment_revision,
    p_finance_account_id
  );

  return v_result || jsonb_build_object('paymentProofPath',v_proof,'qrisUniqueDiscountIdr',v_discount);
end;
$$;
revoke execute on function public.confirm_order_payment_with_proof(text,integer,text,text) from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
