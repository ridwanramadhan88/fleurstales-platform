-- Pickup & delivery hours per branch (Owner Settings -> Branches).
--
-- Stored on each day of branches.opening_hours as fulfillmentStartsAt /
-- fulfillmentEndsAt (same window for pickup and delivery). When a day has no
-- window the opening hours apply, exactly as before. Opening hours keep
-- driving attendance and staff scheduling.
--
-- The two order-time checks below are the latest definitions of
-- private.resolve_checkout_quote (storefront checkout) and
-- public.quote_internal_order (OS orders), unchanged except for the window.

begin;

create or replace function private.branch_fulfillment_window(p_day jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_day is null then null
    when nullif(p_day->>'fulfillmentStartsAt', '') is not null and nullif(p_day->>'fulfillmentEndsAt', '') is not null
      then jsonb_build_object('isOpen', coalesce((p_day->>'isOpen')::boolean, false), 'opensAt', p_day->>'fulfillmentStartsAt', 'closesAt', p_day->>'fulfillmentEndsAt')
    else p_day
  end
$$;
revoke execute on function private.branch_fulfillment_window(jsonb) from public, anon, authenticated;

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
  v_day_key:=lower(trim(to_char(p_schedule_date,'FMDay'))); v_hours:=private.branch_fulfillment_window(v_branch.opening_hours->v_day_key);
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

create or replace function public.quote_internal_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_customer_json jsonb:=coalesce(p_payload->'customer','{}'::jsonb);
  v_branch public.branches%rowtype;
  v_items jsonb:=coalesce(p_payload->'items','[]'::jsonb);
  v_quote_items jsonb:='[]'::jsonb;
  v_item jsonb; v_product public.products%rowtype; v_variant public.product_variants%rowtype;
  v_qty integer; v_unit bigint; v_subtotal bigint:=0; v_delivery bigint:=0; v_discount bigint:=0;
  v_fulfillment text:=p_payload->>'fulfillment'; v_payment_method text:=nullif(p_payload->>'paymentMethod','');
  v_schedule_date date; v_schedule_time time; v_day_key text; v_hours jsonb; v_quote jsonb; v_promo jsonb;
begin
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  if not private.has_action_permission('orders.create') then raise exception 'ORDER_CREATE_PERMISSION_REQUIRED' using errcode='42501'; end if;
  if coalesce(p_payload->>'source','') not in ('whatsapp','walk_in') then raise exception 'INVALID_INTERNAL_ORDER_SOURCE' using errcode='22023'; end if;
  if v_fulfillment not in ('delivery','pickup') then raise exception 'INVALID_FULFILLMENT' using errcode='22023'; end if;
  select * into v_branch from public.branches where id=p_payload->>'branchId' and is_active=true;
  if not found then raise exception 'Selected branch is unavailable.' using errcode='22023'; end if;
  if v_profile.role='admin' and private.current_staff_branch_id() is distinct from v_branch.id then raise exception 'ADMIN_BRANCH_SCOPE_REQUIRED' using errcode='42501'; end if;
  if v_payment_method not in ('transfer','cash') then raise exception 'INVALID_PAYMENT_METHOD' using errcode='22023'; end if;
  if v_fulfillment='delivery' and v_payment_method='cash' then raise exception 'Cash payment is only available for pickup orders.' using errcode='22023'; end if;
  if v_fulfillment='delivery' and nullif(trim(coalesce(p_payload->>'deliveryAddress','')),'') is null then raise exception 'Delivery address is required.' using errcode='22023'; end if;
  v_schedule_date:=nullif(p_payload->>'scheduleDate','')::date; v_schedule_time:=nullif(p_payload->>'scheduleTime','')::time;
  if v_schedule_date is null or v_schedule_time is null then raise exception 'Schedule date and time are required.' using errcode='22023'; end if;
  if v_schedule_date < timezone('Asia/Jakarta',now())::date then raise exception 'Schedule date cannot be in the past.' using errcode='22023'; end if;
  v_day_key:=lower(trim(to_char(v_schedule_date,'FMDay'))); v_hours:=private.branch_fulfillment_window(v_branch.opening_hours->v_day_key);
  if v_hours is null or coalesce((v_hours->>'isOpen')::boolean,false)=false then raise exception 'Selected branch is closed on this date.' using errcode='22023'; end if;
  if v_schedule_time < (v_hours->>'opensAt')::time or v_schedule_time > (v_hours->>'closesAt')::time then raise exception 'Selected time is outside branch opening hours.' using errcode='22023'; end if;
  if v_payment_method='transfer' and not exists (select 1 from public.public_payment_accounts a where a.is_active=true and a.is_customer_visible=true and (cardinality(a.branch_ids)=0 or v_branch.id=any(a.branch_ids))) then raise exception 'Bank transfer is unavailable for this branch.' using errcode='22023'; end if;
  if nullif(trim(v_customer_json->>'name'),'') is null or length(private.normalize_whatsapp(v_customer_json->>'whatsappNumber'))<8 then raise exception 'VALID_CUSTOMER_REQUIRED' using errcode='22023'; end if;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)<1 or jsonb_array_length(v_items)>20 then raise exception 'ORDER_ITEMS_REQUIRED' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty:=coalesce((v_item->>'quantity')::integer,0); if v_qty<1 or v_qty>99 then raise exception 'Item quantity must be between 1 and 99.' using errcode='22023'; end if;
    if coalesce(v_item->>'mode','catalog')='catalog' then
      select * into v_product from public.products where id=v_item->>'productId' and is_active=true; if not found then raise exception 'A selected product is unavailable.' using errcode='22023'; end if;
      select * into v_variant from public.product_variants where id=v_item->>'variantId' and product_id=v_product.id and status='active'; if not found then raise exception 'A selected product variant is unavailable.' using errcode='22023'; end if;
      v_unit:=v_variant.price_idr; v_quote_items:=v_quote_items||jsonb_build_array(jsonb_build_object('productId',v_product.id,'variantId',v_variant.id,'quantity',v_qty));
    else
      v_unit:=coalesce((v_item->>'unitPriceIdr')::bigint,0); if v_unit<=0 then raise exception 'CUSTOM_ITEM_PRICE_REQUIRED' using errcode='22023'; end if;
      if nullif(trim(v_item->>'productName'),'') is null then raise exception 'CUSTOM_ITEM_NAME_REQUIRED' using errcode='22023'; end if;
    end if;
    v_subtotal:=v_subtotal+v_unit*v_qty;
  end loop;
  if jsonb_array_length(v_quote_items)=jsonb_array_length(v_items) then
    v_quote:=private.resolve_checkout_quote(v_customer_json,v_branch.id,v_fulfillment,v_schedule_date,v_schedule_time,v_quote_items,coalesce(v_payment_method,'transfer'),p_payload->>'promoCode');
    return v_quote;
  end if;
  v_delivery:=case when v_fulfillment='delivery' then v_branch.delivery_fee_idr else 0 end;
  v_promo:=private.resolve_voucher_discount(v_customer_json,v_subtotal,p_payload->>'promoCode');
  v_discount:=coalesce((v_promo->>'discountIdr')::bigint,0);
  return jsonb_build_object('itemsSubtotalIdr',v_subtotal,'deliveryFeeIdr',v_delivery,'discountIdr',v_discount,'totalIdr',greatest(0,v_subtotal-v_discount+v_delivery),'promoCode',nullif(upper(trim(coalesce(p_payload->>'promoCode',''))),''),'promoAccepted',coalesce((v_promo->>'promoAccepted')::boolean,false),'promoMessage',v_promo->>'promoMessage');
end;
$$;

-- Owner decision 6 Nov 2026: Kedamaian 08.00-16.00, Pahoman ("Flambo")
-- 10.30-19.00, same every day. Only open days get a window; ids are the
-- production branch ids. Branches that do not exist are simply skipped.
update public.branches b
set opening_hours = (
      select jsonb_object_agg(day.key,
        case when coalesce((day.value->>'isOpen')::boolean, false)
          then day.value || jsonb_build_object('fulfillmentStartsAt', w.starts_at, 'fulfillmentEndsAt', w.ends_at)
          else day.value end)
      from jsonb_each(b.opening_hours) day
    ),
    updated_at = now()
from (values ('Kedamaian', '08:00', '16:00'), ('Pahoman', '10:30', '19:00')) as w(branch_id, starts_at, ends_at)
where b.id = w.branch_id
  and jsonb_typeof(b.opening_hours) = 'object'
  and b.opening_hours <> '{}'::jsonb;

notify pgrst, 'reload schema';

commit;
