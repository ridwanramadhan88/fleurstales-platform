-- Order hygiene fixes from the 2026-10-02 audit: payment-proof reads for Owner/Admin,
-- automatic expiry of stale unpaid Storefront orders, the per-IP checkout budget and
-- one answer per review question. Everything is rolled back.
-- Full CI guard: keep this end-to-end database path in the migration replay gate.
begin;

do $$
declare
  v_policy text;
begin
  select qual into v_policy
  from pg_policies
  where schemaname='storage' and tablename='objects' and policyname='order_payment_proofs_storage_select';
  if v_policy is null
     or position('finance' in lower(v_policy))=0
     or position('can_write_order_media_object' in v_policy)=0 then
    raise exception 'Payment proof reads must allow Finance plus the Owner/Admin who may upload them, got %', v_policy;
  end if;

  if has_function_privilege('anon','private.expire_stale_storefront_orders()','EXECUTE')
     or has_function_privilege('authenticated','private.expire_stale_storefront_orders()','EXECUTE')
     or has_function_privilege('anon','private.consume_public_checkout_budget()','EXECUTE')
     or has_function_privilege('authenticated','private.consume_public_checkout_budget()','EXECUTE') then
    raise exception 'Order hygiene helpers must not be callable from the browser';
  end if;

  if not exists (
    select 1 from cron.job
    where jobname='expire-stale-storefront-orders'
      and active
      and command like '%private.expire_stale_storefront_orders()%'
  ) then
    raise exception 'Stale Storefront order expiry job is not scheduled';
  end if;
end;
$$;

insert into public.branches (id, name, code, is_active, delivery_fee_idr, opening_hours)
values (
  'smoke-hygiene-branch', 'Hygiene Smoke Branch', 'SHY', true, 0,
  jsonb_build_object(
    'monday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'tuesday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'wednesday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'thursday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'friday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'saturday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59'),
    'sunday', jsonb_build_object('isOpen', true, 'opensAt', '00:00', 'closesAt', '23:59')
  )
)
on conflict (id) do update set is_active = true, opening_hours = excluded.opening_hours, updated_at = now();

update public.public_payment_accounts set is_default = false where is_default = true;

insert into public.public_payment_accounts (
  id, bank_name, account_number, account_holder, type, is_active, is_default, is_customer_visible, branch_ids
) values (
  'smoke-hygiene-account', 'Smoke Bank', '0000000000', 'Smoke Account', 'bank_transfer',
  true, true, true, array['smoke-hygiene-branch']::text[]
)
on conflict (id) do update set is_active = true, is_default = true, is_customer_visible = true,
  branch_ids = excluded.branch_ids, updated_at = now();

insert into public.products (id, product_code, material, name, is_active)
values ('smoke-hygiene-product', 'SHY-PRODUCT', 'fresh', 'Hygiene Smoke Product', true)
on conflict (id) do update set is_active = true, updated_at = now();

insert into public.product_variants (id, product_id, sku, size, price_idr, status)
values ('smoke-hygiene-variant', 'smoke-hygiene-product', 'SHY-VARIANT', 'M', 250000, 'active')
on conflict (id) do update set price_idr = excluded.price_idr, status = 'active', updated_at = now();

update private.review_questions set is_active = false where is_active;
insert into private.review_questions (id, question, display_order, is_active) values
  ('smoke-hygiene-q1', 'Flower quality', 1, true),
  ('smoke-hygiene-q2', 'Delivery experience', 2, true);

do $$
declare
  v_items jsonb := jsonb_build_array(jsonb_build_object(
    'productId', 'smoke-hygiene-product', 'variantId', 'smoke-hygiene-variant', 'quantity', 1
  ));
  v_tomorrow date := timezone('Asia/Jakarta', now())::date + 1;
  v_fresh public.orders%rowtype;
  v_old public.orders%rowtype;
  v_result jsonb;
  v_expired integer;
  v_blocked boolean;
  i integer;
begin
  -- Two Storefront orders: one 3 days old (inside the 7-day window), one just over 7 days old.
  for i in 1..2 loop
    v_result := public.create_storefront_order(
      'smoke-hygiene-order-000' || i,
      jsonb_build_object('name', 'Hygiene Smoke Customer ' || i, 'whatsappNumber', '08990000700' || i),
      'smoke-hygiene-branch', 'pickup', v_tomorrow, ('1' || i || ':00')::time, v_items,
      null, null, null, null, null, 'transfer', null
    );
    if i = 1 then select * into v_fresh from public.orders where id = v_result->>'orderId'; end if;
    if i = 2 then select * into v_old from public.orders where id = v_result->>'orderId'; end if;
  end loop;

  update public.orders set created_at = now() - interval '3 days' where id = v_fresh.id;
  update public.orders set created_at = now() - interval '7 days 1 hour' where id = v_old.id;

  -- The capacity guard rejects past slots on purpose, so the passed-slot rule is checked
  -- in the function body rather than by moving a live order into the past.
  if position('schedule_date + coalesce(o.schedule_time' in pg_get_functiondef('private.expire_stale_storefront_orders()'::regprocedure)) = 0 then
    raise exception 'Expiry must also cancel unpaid orders whose scheduled time has passed';
  end if;

  v_expired := private.expire_stale_storefront_orders();
  if v_expired < 1 then
    raise exception 'Expected the stale smoke order to expire, got %', v_expired;
  end if;

  select * into v_fresh from public.orders where id = v_fresh.id;
  select * into v_old from public.orders where id = v_old.id;
  if v_fresh.status <> 'pending_verification' then
    raise exception 'A 3-day-old unpaid order must wait for the 7-day window, got %', v_fresh.status;
  end if;
  if v_old.status <> 'cancelled' or v_old.cancelled_by <> 'System'
     or position('7 days' in v_old.cancellation_reason) = 0 then
    raise exception 'An unpaid order older than 7 days must be cancelled by System, got % / % / %',
      v_old.status, v_old.cancelled_by, v_old.cancellation_reason;
  end if;
  if not exists (select 1 from public.order_activities where order_id = v_old.id and actor = 'System') then
    raise exception 'Automatic cancellation must leave an order activity';
  end if;
  if private.expire_stale_storefront_orders() <> 0 then
    raise exception 'Expiry must be idempotent';
  end if;

  -- Checkout budget: 20 new orders per IP per hour, then HTTP 429.
  perform set_config('request.headers', '{"x-real-ip":"203.0.113.77"}', true);
  for i in 1..20 loop
    perform private.consume_public_checkout_budget();
  end loop;
  v_blocked := false;
  begin
    perform private.consume_public_checkout_budget();
  exception when others then
    v_blocked := sqlstate = 'PGRST' and position('CHECKOUT_RATE_LIMITED' in sqlerrm) > 0;
  end;
  if not v_blocked then
    raise exception 'The 21st checkout in an hour from one IP must be rate limited';
  end if;

  v_blocked := false;
  begin
    perform public.create_storefront_order(
      'smoke-hygiene-order-0009',
      jsonb_build_object('name', 'Hygiene Smoke Customer 9', 'whatsappNumber', '089900007009'),
      'smoke-hygiene-branch', 'pickup', v_tomorrow, '15:00'::time, v_items,
      null, null, null, null, null, 'transfer', null
    );
  exception when others then
    v_blocked := sqlstate = 'PGRST';
  end;
  if not v_blocked then
    raise exception 'A new checkout over budget must be rejected';
  end if;

  -- A retry of an existing idempotency key still returns the order.
  v_result := public.create_storefront_order(
    'smoke-hygiene-order-0001',
    jsonb_build_object('name', 'Hygiene Smoke Customer 1', 'whatsappNumber', '089900007001'),
    'smoke-hygiene-branch', 'pickup', v_tomorrow, '11:00'::time, v_items,
    null, null, null, null, null, 'transfer', null
  );
  if v_result->>'orderId' <> v_fresh.id or coalesce((v_result->>'deduplicated')::boolean, false) is not true then
    raise exception 'A checkout retry over budget must still return the existing order, got %', v_result;
  end if;
  perform set_config('request.headers', '', true);

  -- Review answers: two answers to the same question must not stand in for both.
  update public.orders set status = 'picked_up', completed_at = now() where id = v_fresh.id;
  v_blocked := false;
  begin
    perform public.submit_order_review(
      v_fresh.public_tracking_id::text,
      jsonb_build_array(
        jsonb_build_object('questionId', 'smoke-hygiene-q1', 'score', 5),
        jsonb_build_object('questionId', 'smoke-hygiene-q1', 'score', 5)
      ),
      null,
      '{}'::jsonb
    );
  exception when others then
    v_blocked := position('ALL_REVIEW_QUESTIONS_REQUIRED' in sqlerrm) > 0;
  end;
  if not v_blocked then
    raise exception 'A review answering one question twice must be rejected';
  end if;

  v_result := public.submit_order_review(
    v_fresh.public_tracking_id::text,
    jsonb_build_array(
      jsonb_build_object('questionId', 'smoke-hygiene-q1', 'score', 5),
      jsonb_build_object('questionId', 'smoke-hygiene-q2', 'score', 4)
    ),
    null,
    '{}'::jsonb
  );
  if coalesce((v_result->>'reviewSubmitted')::boolean, false) is not true then
    raise exception 'A complete review must still be accepted, got %', v_result;
  end if;
end;
$$;

rollback;
