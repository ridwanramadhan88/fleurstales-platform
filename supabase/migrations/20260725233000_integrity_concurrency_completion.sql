-- Fleurstales V3.6 integrity and concurrency completion.
-- Binds idempotency keys to payloads, makes attendance evidence server-derived,
-- removes duplicate internal-order events, hardens voucher qualification,
-- and keeps normalized employee points synchronized with the HR projection.

begin;

alter table public.orders
  add column if not exists idempotency_request_hash text;

create index if not exists idx_orders_idempotency_hash
  on public.orders(storefront_idempotency_key,idempotency_request_hash)
  where storefront_idempotency_key is not null;

create or replace function private.jsonb_request_hash(p_value jsonb)
returns text
language sql
immutable
strict
set search_path=''
as $$
  select md5(p_value::text)
$$;
revoke execute on function private.jsonb_request_hash(jsonb) from public,anon,authenticated;

create or replace function private.order_idempotency_result(p_order public.orders,p_deduplicated boolean)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_build_object(
    'orderId',p_order.id,
    'orderNumber',p_order.order_number,
    'customerId',p_order.customer_id,
    'itemsSubtotalIdr',p_order.items_subtotal_idr,
    'deliveryFeeIdr',p_order.delivery_fee_idr,
    'discountIdr',p_order.discount_idr,
    'totalIdr',p_order.total_idr,
    'paidAmountIdr',p_order.paid_amount_idr,
    'deduplicated',p_deduplicated
  )
$$;
revoke execute on function private.order_idempotency_result(public.orders,boolean) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Storefront idempotency: one key is permanently bound to one request payload.
-- The losing request in a unique-key race returns the winner unchanged.
-- ---------------------------------------------------------------------------
alter function public.create_storefront_order(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text)
  rename to create_storefront_order_v35_internal;
revoke execute on function public.create_storefront_order_v35_internal(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text)
  from public,anon,authenticated;

create or replace function public.create_storefront_order(
  p_idempotency_key text,p_customer jsonb,p_branch_id text,p_fulfillment text,
  p_schedule_date date,p_schedule_time time,p_items jsonb,
  p_delivery_address text default null,p_delivery_instructions text default null,
  p_order_note text default null,p_greeting_message text default null,
  p_greeting_card_name text default null,p_payment_method text default 'transfer',
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key text:=trim(coalesce(p_idempotency_key,''));
  v_payload jsonb;
  v_hash text;
  v_existing public.orders%rowtype;
  v_result jsonb;
  v_quote jsonb;
  v_order_id text;
begin
  if length(v_key)<16 or length(v_key)>128 then
    raise exception 'VALID_IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';
  end if;
  v_payload:=jsonb_build_object(
    'customer',coalesce(p_customer,'{}'::jsonb),'branchId',p_branch_id,
    'fulfillment',p_fulfillment,'scheduleDate',p_schedule_date,
    'scheduleTime',p_schedule_time,'items',coalesce(p_items,'[]'::jsonb),
    'deliveryAddress',nullif(trim(coalesce(p_delivery_address,'')),''),
    'deliveryInstructions',nullif(trim(coalesce(p_delivery_instructions,'')),''),
    'orderNote',nullif(trim(coalesce(p_order_note,'')),''),
    'greetingMessage',nullif(trim(coalesce(p_greeting_message,'')),''),
    'greetingCardName',nullif(trim(coalesce(p_greeting_card_name,'')),''),
    'paymentMethod',p_payment_method,'promoCode',upper(trim(coalesce(p_promo_code,'')))
  );
  v_hash:=private.jsonb_request_hash(v_payload);
  -- Serialize all requests that share an idempotency key. The lock is held
  -- until this transaction commits, so a concurrent identical request sees
  -- the winner only after its request hash and final totals are committed.
  perform pg_advisory_xact_lock(hashtextextended('storefront:'||v_key,0));
  select * into v_existing from public.orders where storefront_idempotency_key=v_key limit 1;
  if found then
    if v_existing.idempotency_request_hash is null or v_existing.idempotency_request_hash<>v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023';
    end if;
    return private.order_idempotency_result(v_existing,true);
  end if;

  v_quote:=private.resolve_checkout_quote(
    p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,
    p_items,p_payment_method,p_promo_code
  );
  if nullif(trim(coalesce(p_promo_code,'')),'') is not null
     and coalesce((v_quote->>'promoAccepted')::boolean,false)=false then
    raise exception '%',coalesce(v_quote->>'promoMessage','Voucher is unavailable for this order.') using errcode='22023';
  end if;

  -- Call the pre-V3.5 creator directly. The V3.5 wrapper applied the
  -- request's quote even when its inner creator returned a deduplicated Order,
  -- which allowed the losing concurrent request to rewrite the winner's total.
  v_result:=public.create_storefront_order_v34_internal(
    v_key,p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,p_items,
    p_delivery_address,p_delivery_instructions,p_order_note,p_greeting_message,
    p_greeting_card_name,p_payment_method,p_promo_code
  );
  v_order_id:=v_result->>'orderId';

  if coalesce((v_result->>'deduplicated')::boolean,false) then
    select * into v_existing from public.orders where id=v_order_id;
    if not found or v_existing.idempotency_request_hash is null or v_existing.idempotency_request_hash<>v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023';
    end if;
    return private.order_idempotency_result(v_existing,true);
  end if;

  update public.orders
  set discount_idr=(v_quote->>'discountIdr')::bigint,
      total_idr=(v_quote->>'totalIdr')::bigint,
      promo_code=nullif(upper(trim(coalesce(p_promo_code,''))),''),
      idempotency_request_hash=v_hash,
      updated_at=now()
  where id=v_order_id
  returning * into v_existing;
  return private.order_idempotency_result(v_existing,false);
end;
$$;
revoke execute on function public.create_storefront_order(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text) from public;
grant execute on function public.create_storefront_order(text,jsonb,text,text,date,time,jsonb,text,text,text,text,text,text,text) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- Internal-order idempotency and strict payment-state validation.
-- Delivery fees remain authoritative from public.branches.
-- ---------------------------------------------------------------------------
alter function public.create_internal_order(jsonb) rename to create_internal_order_v35_internal;
revoke execute on function public.create_internal_order_v35_internal(jsonb) from public,anon,authenticated;

create or replace function public.create_internal_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key text:=trim(coalesce(p_payload->>'idempotencyKey',''));
  v_hash text;
  v_existing public.orders%rowtype;
  v_result jsonb;
  v_order_id text;
  v_profile public.staff_access_profiles%rowtype;
  v_status text:=coalesce(p_payload->>'paymentStatus','');
  v_deposit bigint:=greatest(0,coalesce((p_payload->>'depositAmountIdr')::bigint,0));
begin
  if length(v_key)<16 or length(v_key)>128 then raise exception 'VALID_IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  v_hash:=private.jsonb_request_hash(coalesce(p_payload,'{}'::jsonb)-'idempotencyKey');
  perform pg_advisory_xact_lock(hashtextextended('internal-order:'||v_key,0));

  select * into v_existing from public.orders where storefront_idempotency_key=v_key limit 1;
  if found then
    if v_existing.idempotency_request_hash is null or v_existing.idempotency_request_hash<>v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023';
    end if;
    return private.order_idempotency_result(v_existing,true);
  end if;

  if v_status='unpaid' and v_deposit<>0 then raise exception 'UNPAID_ORDER_CANNOT_HAVE_DEPOSIT' using errcode='22023'; end if;
  if v_status='partial' and v_deposit<=0 then raise exception 'PARTIAL_PAYMENT_REQUIRES_DEPOSIT' using errcode='22023'; end if;
  if v_status='paid' and v_deposit<>0 then raise exception 'PAID_ORDER_AMOUNT_IS_SERVER_RESOLVED' using errcode='22023'; end if;

  begin
    v_result:=public.create_internal_order_v35_internal(p_payload);
  exception when unique_violation then
    select * into v_existing from public.orders where storefront_idempotency_key=v_key limit 1;
    if not found or v_existing.idempotency_request_hash is null or v_existing.idempotency_request_hash<>v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023';
    end if;
    return private.order_idempotency_result(v_existing,true);
  end;

  v_order_id:=v_result->>'orderId';
  if coalesce((v_result->>'deduplicated')::boolean,false) then
    select * into v_existing from public.orders where id=v_order_id;
    if not found or v_existing.idempotency_request_hash is null or v_existing.idempotency_request_hash<>v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023';
    end if;
    return private.order_idempotency_result(v_existing,true);
  end if;

  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  update public.orders
  set idempotency_request_hash=v_hash,
      admin_handled_employee_id=case when v_profile.role='admin' then v_profile.employee_id else null end,
      admin_handled_by_name=case when v_profile.role='admin' then v_profile.display_name else null end,
      updated_at=now()
  where id=v_order_id
  returning * into v_existing;

  if v_status='partial' and (v_existing.paid_amount_idr<=0 or v_existing.paid_amount_idr>=v_existing.total_idr) then
    raise exception 'PARTIAL_PAYMENT_MUST_BE_BETWEEN_ZERO_AND_TOTAL' using errcode='22023';
  end if;
  return private.order_idempotency_result(v_existing,false);
end;
$$;
revoke execute on function public.create_internal_order(jsonb) from public,anon;
grant execute on function public.create_internal_order(jsonb) to authenticated;

-- One trigger owns generic Order-created events. Internal creation keeps its
-- richer Business OS activity/Finance notification without duplicating them.
create or replace function private.on_order_created_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.source not in ('whatsapp','walk_in') then
    insert into public.business_activities(
      entity_type,entity_id,branch_id,kind,description,actor_user_id,actor_employee_id,actor_name,actor_role,metadata,occurred_at
    ) values (
      'order',new.id,new.branch_id,'created','Order '||new.order_number||' created',
      (select auth.uid()),null,case when (select auth.uid()) is null then 'Storefront' else 'Staff' end,
      private.current_staff_role(),jsonb_build_object('source',new.source,'status',new.status),now()
    );
  end if;
  perform private.notify_roles(
    array['owner','admin'],new.branch_id,'order_received','info',
    'New order '||new.order_number,coalesce(new.customer_name_snapshot,'Customer')||' · '||new.fulfillment,
    'order',new.id,'order',new.order_number
  );
  if new.status='pending_verification' and new.source not in ('whatsapp','walk_in') then
    perform private.notify_roles(
      array['owner','finance'],new.branch_id,'order_pending_verification','warning',
      new.order_number||' needs verification',coalesce(new.customer_name_snapshot,'Customer')||' · Finance review pending',
      'order',new.id,'finance_orders',new.order_number
    );
  end if;
  return new;
end;
$$;
revoke execute on function private.on_order_created_event() from public,anon,authenticated;

-- Remove only exact duplicate historical server events generated by V3.5.
with ranked as (
  select id,row_number() over(partition by entity_type,entity_id,kind,description,date_trunc('second',occurred_at) order by occurred_at,id) rn
  from public.business_activities where entity_type='order' and kind='created'
)
delete from public.business_activities b using ranked r where b.id=r.id and r.rn>1;
with ranked as (
  select id,row_number() over(partition by recipient_user_id,kind,entity_id,title,date_trunc('second',created_at) order by created_at,id) rn
  from public.staff_notifications where kind='order_pending_verification'
)
delete from public.staff_notifications n using ranked r where n.id=r.id and r.rn>1;

-- ---------------------------------------------------------------------------
-- Voucher qualification counts verified business, not unpaid intentions.
-- ---------------------------------------------------------------------------
create or replace function private.customer_voucher_metrics(p_customer_id text)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select jsonb_build_object(
    'spendIdr',coalesce(sum(case when finance_verified=true and payment_status in ('paid','partial') and status not in ('cancelled','failed') then paid_amount_idr else 0 end),0),
    'orderCount',count(*) filter(where finance_verified=true and status in ('delivered','picked_up') and payment_status in ('paid','partial'))
  )
  from public.orders where customer_id=p_customer_id
$$;
revoke execute on function private.customer_voucher_metrics(text) from public,anon,authenticated;

-- Patch both quote functions to use the verified metrics helper.
-- Their remaining pricing/eligibility behavior is preserved.
create or replace function private.resolve_voucher_discount(
  p_customer jsonb,p_subtotal bigint,p_promo_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text:=upper(trim(coalesce(p_promo_code,''))); v_voucher jsonb;
  v_customer public.customers%rowtype; v_normalized text:=private.normalize_whatsapp(p_customer->>'whatsappNumber');
  v_metrics jsonb; v_spend bigint:=0; v_count integer:=0; v_segments jsonb; v_is_vip boolean:=false;
  v_customer_found boolean:=false; v_eligible boolean:=false; v_percent integer:=0; v_discount bigint:=0; v_message text;
begin
  if v_code='' then return jsonb_build_object('discountIdr',0,'promoCode',null,'promoAccepted',false,'promoMessage',null); end if;
  select value into v_voucher from private.operational_domain_state s,lateral jsonb_array_elements(coalesce(s.snapshot->'vouchers','[]'::jsonb)) e(value)
  where s.domain='vouchers' and upper(trim(value->>'code'))=v_code limit 1;
  if v_voucher is null then v_message:='Voucher is unavailable for this order.';
  elsif coalesce((v_voucher->>'isActive')::boolean,false)=false then v_message:='Voucher is unavailable for this order.';
  elsif nullif(v_voucher->>'startDate','') is not null and timezone('Asia/Jakarta',now())::date<(v_voucher->>'startDate')::date then v_message:='Voucher is unavailable for this order.';
  elsif nullif(v_voucher->>'endDate','') is not null and timezone('Asia/Jakarta',now())::date>(v_voucher->>'endDate')::date then v_message:='Voucher is unavailable for this order.';
  elsif greatest(0,coalesce(p_subtotal,0))<coalesce((v_voucher->>'minOrderIdr')::bigint,0) then v_message:='Voucher is unavailable for this order.';
  else
    select * into v_customer from public.customers where normalized_whatsapp_number=v_normalized limit 1; v_customer_found:=found;
    if v_customer_found then v_metrics:=private.customer_voucher_metrics(v_customer.id); v_spend:=coalesce((v_metrics->>'spendIdr')::bigint,0); v_count:=coalesce((v_metrics->>'orderCount')::integer,0); end if;
    select customer_segments into v_segments from private.internal_settings_state where id='primary';
    v_is_vip:=case coalesce(v_segments->>'mode','either') when 'spend' then v_spend>=coalesce((v_segments->>'minLifetimeSpend')::bigint,1000000) when 'orders' then v_count>=coalesce((v_segments->>'minOrderCount')::integer,5) else v_spend>=coalesce((v_segments->>'minLifetimeSpend')::bigint,1000000) or v_count>=coalesce((v_segments->>'minOrderCount')::integer,5) end;
    v_eligible:=case coalesce(v_voucher->>'eligibility','all') when 'all' then true when 'vip' then v_is_vip when 'selected' then v_customer_found and coalesce(v_voucher->'selectedCustomerIds','[]'::jsonb) ? v_customer.id else false end;
    if not v_eligible then v_message:='Voucher is unavailable for this order.'; else v_percent:=greatest(0,least(100,coalesce((v_voucher->>'percentOff')::integer,0))); v_discount:=round(greatest(0,p_subtotal)*v_percent/100.0)::bigint; v_message:='Voucher applied.'; end if;
  end if;
  return jsonb_build_object('discountIdr',v_discount,'promoCode',v_code,'promoAccepted',v_discount>0,'promoMessage',v_message);
end;
$$;
revoke execute on function private.resolve_voucher_discount(jsonb,bigint,text) from public,anon,authenticated;

-- The catalog-only quote function keeps its server price resolution while
-- delegating voucher eligibility to the corrected helper.
create or replace function private.resolve_checkout_quote(
  p_customer jsonb,p_branch_id text,p_fulfillment text,p_schedule_date date,p_schedule_time time,
  p_items jsonb,p_payment_method text,p_promo_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_branch public.branches%rowtype; v_item jsonb; v_product public.products%rowtype; v_variant public.product_variants%rowtype;
  v_qty integer; v_subtotal bigint:=0; v_delivery bigint:=0; v_promo jsonb; v_day_key text; v_hours jsonb;
begin
  if nullif(trim(coalesce(p_customer->>'name','')),'') is null then raise exception 'Customer name is required.' using errcode='22023'; end if;
  if length(private.normalize_whatsapp(p_customer->>'whatsappNumber'))<8 then raise exception 'A valid WhatsApp number is required.' using errcode='22023'; end if;
  select * into v_branch from public.branches where id=p_branch_id and is_active=true; if not found then raise exception 'Selected branch is unavailable.' using errcode='22023'; end if;
  if p_fulfillment not in ('delivery','pickup') then raise exception 'Invalid fulfillment type.' using errcode='22023'; end if;
  if p_payment_method not in ('transfer','cash') then raise exception 'Invalid payment method.' using errcode='22023'; end if;
  if p_fulfillment='delivery' and p_payment_method='cash' then raise exception 'Cash payment is only available for pickup orders.' using errcode='22023'; end if;
  if p_payment_method='transfer' and not exists(select 1 from public.public_payment_accounts a where a.is_active=true and a.is_customer_visible=true and (cardinality(a.branch_ids)=0 or p_branch_id=any(a.branch_ids))) then raise exception 'Bank transfer is unavailable for this branch.' using errcode='22023'; end if;
  if p_schedule_date is null or p_schedule_time is null then raise exception 'Schedule date and time are required.' using errcode='22023'; end if;
  if p_schedule_date<timezone('Asia/Jakarta',now())::date then raise exception 'Schedule date cannot be in the past.' using errcode='22023'; end if;
  v_day_key:=lower(trim(to_char(p_schedule_date,'FMDay'))); v_hours:=v_branch.opening_hours->v_day_key;
  if v_hours is null or coalesce((v_hours->>'isOpen')::boolean,false)=false then raise exception 'Selected branch is closed on this date.' using errcode='22023'; end if;
  if p_schedule_time<(v_hours->>'opensAt')::time or p_schedule_time>(v_hours->>'closesAt')::time then raise exception 'Selected time is outside branch opening hours.' using errcode='22023'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>20 then raise exception 'Order must contain between 1 and 20 items.' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=coalesce((v_item->>'quantity')::integer,0); if v_qty<1 or v_qty>99 then raise exception 'Item quantity must be between 1 and 99.' using errcode='22023'; end if;
    select * into v_product from public.products where id=nullif(v_item->>'productId','') and is_active=true; if not found then raise exception 'A selected product is unavailable.' using errcode='22023'; end if;
    select * into v_variant from public.product_variants where id=nullif(v_item->>'variantId','') and product_id=v_product.id and status='active'; if not found then raise exception 'A selected product variant is unavailable.' using errcode='22023'; end if;
    v_subtotal:=v_subtotal+v_variant.price_idr*v_qty;
  end loop;
  v_delivery:=case when p_fulfillment='delivery' then v_branch.delivery_fee_idr else 0 end;
  v_promo:=private.resolve_voucher_discount(p_customer,v_subtotal,p_promo_code);
  return jsonb_build_object('itemsSubtotalIdr',v_subtotal,'deliveryFeeIdr',v_delivery,'discountIdr',coalesce((v_promo->>'discountIdr')::bigint,0),'totalIdr',greatest(0,v_subtotal-coalesce((v_promo->>'discountIdr')::bigint,0)+v_delivery),'promoCode',v_promo->>'promoCode','promoAccepted',coalesce((v_promo->>'promoAccepted')::boolean,false),'promoMessage',v_promo->>'promoMessage');
end;
$$;
revoke execute on function private.resolve_checkout_quote(jsonb,text,text,date,time,jsonb,text,text) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Attendance: clients supply raw coordinates/selfies only. PostgreSQL derives
-- branch, distance, schedule comparison, status, and review evidence.
-- ---------------------------------------------------------------------------
create or replace function private.geo_distance_meters(p_lat1 double precision,p_lng1 double precision,p_lat2 double precision,p_lng2 double precision)
returns integer
language sql
immutable
strict
set search_path=''
as $$
  select round(6371000*2*asin(sqrt(power(sin(radians(p_lat2-p_lat1)/2),2)+cos(radians(p_lat1))*cos(radians(p_lat2))*power(sin(radians(p_lng2-p_lng1)/2),2))))::integer
$$;
revoke execute on function private.geo_distance_meters(double precision,double precision,double precision,double precision) from public,anon,authenticated;

create or replace function public.save_my_attendance_record(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype; v_existing jsonb; v_now timestamptz:=now(); v_date date:=timezone('Asia/Jakarta',v_now)::date;
  v_location jsonb; v_lat double precision; v_lng double precision; v_accuracy double precision; v_radius integer; v_grace integer;
  v_branch public.branches%rowtype; v_distance integer; v_day text:=lower(trim(to_char(v_date,'FMDay'))); v_shift jsonb; v_override jsonb; v_defaults jsonb;
  v_schedule_branch text; v_start time; v_end time; v_is_working boolean:=false; v_current time:=timezone('Asia/Jakarta',v_now)::time;
  v_mismatch boolean:=false; v_review_reason text; v_status text; v_evidence jsonb; v_safe jsonb; v_state private.operational_domain_state%rowtype; v_records jsonb; v_revision bigint;
  v_is_checkout boolean:=nullif(p_record->>'checkOutSelfieDataUrl','') is not null;
begin
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true and role in ('admin','florist') limit 1;
  if not found then raise exception 'SELF_ATTENDANCE_ROLE_REQUIRED' using errcode='42501'; end if;
  if nullif(p_record->>'date','')::date is distinct from v_date then raise exception 'ATTENDANCE_DATE_MUST_BE_TODAY' using errcode='22023'; end if;
  select record into v_existing from public.staff_attendance_records where employee_id=v_profile.employee_id and attendance_date=v_date for update;

  if v_is_checkout then
    if v_existing is null or nullif(v_existing->>'checkInAt','') is null then raise exception 'CHECKOUT_REQUIRES_EXISTING_CHECKIN' using errcode='22023'; end if;
    if nullif(v_existing->>'checkOutAt','') is not null then return jsonb_build_object('record',v_existing,'revision',null,'updatedAt',v_now); end if;
    if coalesce(p_record->>'checkOutSelfieDataUrl','') not like 'data:image/jpeg;base64,%' or length(p_record->>'checkOutSelfieDataUrl')>150000 then raise exception 'VALID_CHECKOUT_SELFIE_REQUIRED' using errcode='22023'; end if;
    v_location:=p_record->'checkOutLocation';
  else
    if v_existing is not null then raise exception 'ATTENDANCE_ALREADY_RECORDED' using errcode='23505'; end if;
    if coalesce(p_record->>'selfieDataUrl','') not like 'data:image/jpeg;base64,%' or length(p_record->>'selfieDataUrl')>150000 then raise exception 'VALID_CHECKIN_SELFIE_REQUIRED' using errcode='22023'; end if;
    v_location:=p_record->'checkInLocation';
  end if;
  if jsonb_typeof(v_location)<>'object' then raise exception 'LOCATION_REQUIRED' using errcode='22023'; end if;
  v_lat:=(v_location->>'latitude')::double precision; v_lng:=(v_location->>'longitude')::double precision; v_accuracy:=greatest(0,coalesce((v_location->>'accuracyMeters')::double precision,0));
  if v_lat not between -90 and 90 or v_lng not between -180 and 180 then raise exception 'INVALID_LOCATION' using errcode='22023'; end if;
  select coalesce((attendance->>'locationRadiusMeters')::integer,100),coalesce((attendance->>'lateGraceMinutes')::integer,10) into v_radius,v_grace from private.internal_settings_state where id='primary';
  select * into v_branch
  from public.branches b where b.is_active=true and b.latitude is not null and b.longitude is not null
  order by private.geo_distance_meters(v_lat,v_lng,b.latitude,b.longitude) limit 1;
  if not found then raise exception 'NO_BRANCH_LOCATION_CONFIGURED' using errcode='55000'; end if;
  v_distance:=private.geo_distance_meters(v_lat,v_lng,v_branch.latitude,v_branch.longitude);
  if v_distance>v_radius then raise exception 'OUTSIDE_ATTENDANCE_RADIUS' using errcode='22023'; end if;

  select shift into v_override from public.staff_schedule_overrides where employee_id=v_profile.employee_id and schedule_date=v_date;
  select days into v_defaults from public.staff_schedule_defaults where employee_id=v_profile.employee_id;
  v_shift:=coalesce(v_override,v_defaults->v_day,(select scheduling->'defaultWeeklySchedule'->v_day from private.internal_settings_state where id='primary'),'{}'::jsonb);
  v_is_working:=coalesce((v_shift->>'isWorking')::boolean,false);
  v_schedule_branch:=coalesce(nullif(v_shift->>'branchId',''),v_profile.branch_id);
  v_start:=nullif(v_shift->>'startTime','')::time; v_end:=nullif(v_shift->>'endTime','')::time;
  v_mismatch:=not v_is_working or (v_schedule_branch is not null and v_schedule_branch<>v_branch.id) or v_accuracy>v_radius*4 or (v_start is not null and v_end is not null and (v_current<v_start or v_current>v_end));
  v_review_reason:=concat_ws(' ',case when not v_is_working then 'Recorded on a scheduled day off.' end,case when v_schedule_branch is not null and v_schedule_branch<>v_branch.id then 'Detected branch differs from scheduled branch.' end,case when v_accuracy>v_radius*4 then 'GPS accuracy requires HR review.' end,case when v_start is not null and v_end is not null and (v_current<v_start or v_current>v_end) then 'Recorded outside the scheduled shift.' end);
  v_status:=case when v_is_working and v_start is not null and v_current>v_start+(v_grace||' minutes')::interval then 'late' else 'present' end;
  v_evidence:=jsonb_build_object('latitude',v_lat,'longitude',v_lng,'accuracyMeters',round(v_accuracy),'branchLatitude',v_branch.latitude,'branchLongitude',v_branch.longitude,'distanceMeters',v_distance,'acceptedRadiusMeters',v_radius,'withinRange',true,'detectedBranchId',v_branch.id,'detectedBranchName',v_branch.name,'scheduledBranchId',v_schedule_branch,'scheduledStartTime',case when v_start is null then null else to_char(v_start,'HH24:MI') end,'scheduledEndTime',case when v_end is null then null else to_char(v_end,'HH24:MI') end,'branchMismatch',v_schedule_branch is not null and v_schedule_branch<>v_branch.id,'scheduleMismatch',v_mismatch,'reviewStatus',case when v_mismatch then 'pending_review' else 'not_required' end,'reviewReason',nullif(v_review_reason,''));

  if v_is_checkout then
    v_safe:=v_existing||jsonb_build_object('checkOutAt',v_now,'checkOutSelfieDataUrl',p_record->>'checkOutSelfieDataUrl','checkOutLocation',v_evidence,'actor',v_profile.display_name);
  else
    v_safe:=jsonb_build_object('id','att-'||replace(gen_random_uuid()::text,'-',''),'employeeId',v_profile.employee_id,'date',v_date,'status',v_status,'actor',v_profile.display_name,'createdAt',v_now,'selfieDataUrl',p_record->>'selfieDataUrl','checkInAt',v_now,'source','selfie','checkInLocation',v_evidence);
  end if;

  insert into public.staff_attendance_records(id,employee_id,attendance_date,status,record,updated_at)
  values(v_safe->>'id',v_profile.employee_id,v_date,v_safe->>'status',v_safe,now())
  on conflict(employee_id,attendance_date) do update set status=excluded.status,record=excluded.record,updated_at=now();

  select * into v_state from private.operational_domain_state where domain='hr' for update;
  if not found then
    insert into private.operational_domain_state(domain,revision,snapshot,updated_by,updated_at)
    values('hr',1,jsonb_build_object('attendance',jsonb_build_array(v_safe)),(select auth.uid()),now())
    returning revision into v_revision;
  else
    select coalesce(jsonb_agg(value),'[]'::jsonb) into v_records from jsonb_array_elements(coalesce(v_state.snapshot->'attendance','[]'::jsonb)) e(value) where not(value->>'employeeId'=v_profile.employee_id and value->>'date'=v_date::text);
    v_records:=coalesce(v_records,'[]'::jsonb)||jsonb_build_array(v_safe);
    update private.operational_domain_state set revision=revision+1,snapshot=jsonb_set(coalesce(snapshot,'{}'::jsonb),'{attendance}',v_records,true),updated_by=(select auth.uid()),updated_at=now() where domain='hr' returning revision into v_revision;
  end if;
  perform private.write_audit_event('attendance.self_service','attendance',v_safe->>'id','succeeded',null,v_revision,v_existing,v_safe);
  perform private.write_business_activity('hr',v_safe->>'id',v_branch.id,'attendance_recorded','Staff attendance was recorded.',jsonb_build_object('activityScope','attendance','employeeId',v_profile.employee_id,'date',v_date));
  return jsonb_build_object('record',v_safe,'revision',v_revision,'updatedAt',now());
end;
$$;
revoke execute on function public.save_my_attendance_record(jsonb) from public,anon;
grant execute on function public.save_my_attendance_record(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Keep normalized point events synchronized with the HR projection so review
-- decisions cannot diverge from the rows exposed through Realtime/reporting.
-- ---------------------------------------------------------------------------
alter table public.employee_point_events alter column source_order_id drop not null;
alter table public.employee_point_events alter column source_order_number drop not null;
alter table public.employee_point_events add column if not exists source_type text;
alter table public.employee_point_events add column if not exists source_id text;
alter table public.employee_point_events add column if not exists reason text;
alter table public.employee_point_events add column if not exists created_by text;
alter table public.employee_point_events add column if not exists reviewed_by text;
alter table public.employee_point_events add column if not exists reviewed_at timestamptz;
alter table public.employee_point_events add column if not exists review_note text;
alter table public.employee_point_events add column if not exists reversed_by_entry_id text;

do $$
declare c record;
begin
  for c in
    select oid,conname
    from pg_constraint
    where conrelid='public.employee_point_events'::regclass and contype='c'
  loop
    if pg_get_constraintdef(c.oid) like '%category%' then
      execute format('alter table public.employee_point_events drop constraint %I',c.conname);
    end if;
  end loop;
end $$;
alter table public.employee_point_events add constraint employee_point_events_category_check check(category in ('attendance_penalty','florist_assignment','admin_order_handled','florist_order_completed','manual_reward','manual_penalty','reversal'));
create unique index if not exists idx_employee_point_events_source on public.employee_point_events(employee_id,source_id) where source_id is not null;

update public.employee_point_events set source_type=coalesce(source_type,'order'),source_id=coalesce(source_id,'order:'||source_order_number||':'||category),reason=coalesce(reason,'Automatic contribution from completed order'),created_by=coalesce(created_by,'System') where source_id is null;

alter function public.save_hr_operational_state(bigint,jsonb) rename to save_hr_operational_state_v35_internal;
revoke execute on function public.save_hr_operational_state_v35_internal(bigint,jsonb) from public,anon,authenticated;
create or replace function private.employee_point_event_json(p_event public.employee_point_events)
returns jsonb
language sql
stable
set search_path=''
as $$
  select coalesce(p_event.metadata,'{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'id',p_event.id,
    'employeeId',p_event.employee_id,
    'category',p_event.category,
    'points',p_event.points,
    'sourceType',p_event.source_type,
    'sourceId',p_event.source_id,
    'effectiveDate',p_event.effective_date,
    'payrollPeriodId',p_event.payroll_period_id,
    'periodKey',replace(coalesce(p_event.payroll_period_id,''),'payroll-',''),
    'orderNumber',p_event.source_order_number,
    'reason',p_event.reason,
    'status',p_event.status,
    'createdBy',p_event.created_by,
    'createdAt',p_event.created_at,
    'reviewedBy',p_event.reviewed_by,
    'reviewedAt',p_event.reviewed_at,
    'reviewNote',p_event.review_note,
    'reversedByEntryId',p_event.reversed_by_entry_id
  ))
$$;
revoke execute on function private.employee_point_event_json(public.employee_point_events) from public,anon,authenticated;

create or replace function public.save_hr_operational_state(p_expected_revision bigint,p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_item jsonb;
  v_points jsonb;
  v_canonical_snapshot jsonb:=coalesce(p_snapshot,'{}'::jsonb);
begin
  -- The normalized table is the persistence authority. The HR JSON array is
  -- rebuilt from it before the legacy operational snapshot is committed.
  for v_item in select value from jsonb_array_elements(coalesce(p_snapshot->'employeePointEntries','[]'::jsonb)) loop
    insert into public.employee_point_events(
      id,employee_id,category,source_order_id,source_order_number,points,
      effective_date,payroll_period_id,status,metadata,created_at,source_type,
      source_id,reason,created_by,reviewed_by,reviewed_at,review_note,
      reversed_by_entry_id
    )
    values(
      v_item->>'id',v_item->>'employeeId',v_item->>'category',
      (select id from public.orders where order_number=v_item->>'orderNumber' limit 1),
      nullif(v_item->>'orderNumber',''),coalesce((v_item->>'points')::integer,0),
      coalesce(nullif(v_item->>'effectiveDate','')::date,timezone('Asia/Jakarta',now())::date),
      coalesce(nullif(v_item->>'payrollPeriodId',''),private.payroll_period_for_date(coalesce(nullif(v_item->>'effectiveDate','')::date,timezone('Asia/Jakarta',now())::date))),
      coalesce(v_item->>'status','pending'),
      coalesce(v_item-'id'-'employeeId'-'category'-'points'-'effectiveDate'-'payrollPeriodId'-'status'-'createdAt'-'sourceType'-'sourceId'-'reason'-'createdBy'-'reviewedBy'-'reviewedAt'-'reviewNote'-'reversedByEntryId'-'orderNumber','{}'::jsonb),
      coalesce(nullif(v_item->>'createdAt','')::timestamptz,now()),
      coalesce(nullif(v_item->>'sourceType',''),'manual'),
      coalesce(nullif(v_item->>'sourceId',''),'entry:'||(v_item->>'id')),
      v_item->>'reason',v_item->>'createdBy',v_item->>'reviewedBy',
      nullif(v_item->>'reviewedAt','')::timestamptz,v_item->>'reviewNote',
      v_item->>'reversedByEntryId'
    )
    on conflict(employee_id,source_id) where source_id is not null do update set
      category=excluded.category,
      source_order_id=coalesce(excluded.source_order_id,public.employee_point_events.source_order_id),
      source_order_number=coalesce(excluded.source_order_number,public.employee_point_events.source_order_number),
      points=excluded.points,effective_date=excluded.effective_date,
      payroll_period_id=excluded.payroll_period_id,status=excluded.status,
      metadata=excluded.metadata,source_type=excluded.source_type,
      reason=excluded.reason,created_by=excluded.created_by,
      reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,
      review_note=excluded.review_note,
      reversed_by_entry_id=excluded.reversed_by_entry_id;
  end loop;

  select coalesce(jsonb_agg(private.employee_point_event_json(e) order by e.created_at desc,e.id),'[]'::jsonb)
    into v_points
  from public.employee_point_events e;
  v_canonical_snapshot:=jsonb_set(v_canonical_snapshot,'{employeePointEntries}',v_points,true);
  v_result:=public.save_hr_operational_state_v35_internal(p_expected_revision,v_canonical_snapshot);
  return v_result;
end;
$$;
revoke execute on function public.save_hr_operational_state(bigint,jsonb) from public,anon;
grant execute on function public.save_hr_operational_state(bigint,jsonb) to authenticated;


create or replace function private.sync_order_contribution_points(p_order_id text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.orders%rowtype; v_hr private.operational_domain_state%rowtype; v_rules jsonb; v_entries jsonb;
  v_employee_id text; v_category text; v_points integer; v_minimum bigint; v_source_id text;
  v_event public.employee_point_events%rowtype; v_entry jsonb; v_period text; v_changed boolean:=false;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found or v_order.status not in ('delivered','picked_up') or v_order.completed_at is null or v_order.payment_status='refunded' then return; end if;
  select * into v_hr from private.operational_domain_state where domain='hr' for update; if not found then return; end if;
  v_rules:=coalesce(v_hr.snapshot->'pointRules','{}'::jsonb);
  v_minimum:=coalesce((v_rules->>'collectOrderMinimumProductSubtotalIdr')::bigint,200000);
  if v_order.items_subtotal_idr<v_minimum or v_order.completed_at<coalesce((v_rules->>'orderContributionActiveFrom')::timestamptz,'2026-07-17T12:00:00+07:00'::timestamptz) then return; end if;
  v_points:=coalesce((v_rules->>'collectOrderPoints')::integer,1);
  v_period:=private.payroll_period_for_date(v_order.completed_at::date);
  v_entries:=coalesce(v_hr.snapshot->'employeePointEntries','[]'::jsonb);
  for v_employee_id,v_category in select * from (values(v_order.admin_handled_employee_id,'admin_order_handled'),(v_order.florist_assigned_employee_id,'florist_order_completed')) q(employee_id,category) loop
    if v_employee_id is null then continue; end if;
    v_source_id:='order:'||v_order.order_number||':'||v_category;
    select * into v_event from public.employee_point_events where employee_id=v_employee_id and source_id=v_source_id limit 1;
    if not found then
      insert into public.employee_point_events(
        id,employee_id,category,source_order_id,source_order_number,points,
        effective_date,payroll_period_id,status,metadata,source_type,source_id,
        reason,created_by
      )
      values(
        'point_'||replace(gen_random_uuid()::text,'-',''),v_employee_id,v_category,
        v_order.id,v_order.order_number,v_points,v_order.completed_at::date,v_period,
        'pending',jsonb_build_object(
          'sourceAmountIdr',v_order.items_subtotal_idr,
          'sourceCompletedAt',v_order.completed_at,
          'ordinal',1,
          'minimumIncluded',0
        ),'order',v_source_id,'Automatic contribution from completed order','System'
      )
      on conflict(employee_id,category,source_order_id) do update set
        source_id=excluded.source_id
      returning * into v_event;
    end if;
    if not exists(select 1 from jsonb_array_elements(v_entries) e where e->>'sourceId'=v_source_id) then
      v_entry:=private.employee_point_event_json(v_event);
      v_entries:=jsonb_build_array(v_entry)||v_entries;
      v_changed:=true;
    end if;
  end loop;
  if v_changed then
    update private.operational_domain_state set revision=revision+1,snapshot=jsonb_set(snapshot,'{employeePointEntries}',v_entries,true),updated_at=now() where domain='hr';
    perform private.write_business_activity('hr',p_order_id,v_order.branch_id,'order_points_generated','Order contribution points were generated.',jsonb_build_object('orderNumber',v_order.order_number,'payrollPeriodId',v_period));
    perform private.write_audit_event('order.points.generate','order',p_order_id,'succeeded',null,null,null,jsonb_build_object('orderNumber',v_order.order_number,'payrollPeriodId',v_period));
  end if;
end;
$$;
revoke execute on function private.sync_order_contribution_points(text) from public,anon,authenticated;

commit;
