-- Static QRIS per branch (Owner request 6 Nov 2026).
--
-- One QRIS per branch (branch_id is the primary key), square image in the
-- public `store-assets` bucket under qris/, linked to one bank account. The
-- customer can choose "QRIS" at checkout; the order is still a transfer
-- (proof upload + Finance verification) whose account snapshot is the linked
-- bank account with channel = 'qris', so reconciliation is unchanged.
-- QRIS is kept out of public_payment_accounts on purpose: those rows are
-- money accounts listed all over Finance (ledger, payroll, refunds).

begin;

create table if not exists public.branch_qris_codes (
  branch_id text primary key references public.branches(id) on update cascade on delete cascade,
  image_path text not null check (image_path ~ '^qris/[A-Za-z0-9._-]+$'),
  linked_account_id text not null references public.public_payment_accounts(id) on update cascade,
  is_active boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.branch_qris_codes enable row level security;
revoke all on public.branch_qris_codes from anon, authenticated;
grant select on public.branch_qris_codes to anon, authenticated;
grant select, insert, update, delete on public.branch_qris_codes to service_role;

drop policy if exists branch_qris_codes_read on public.branch_qris_codes;
create policy branch_qris_codes_read on public.branch_qris_codes
for select to anon, authenticated
using (is_active = true or private.has_staff_role(array['owner']));

-- Snapshot used by checkout: the linked bank account + QRIS marker.
create or replace function private.storefront_qris_account(p_branch_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accountId', a.id,
    'bankName', a.bank_name,
    'accountNumber', a.account_number,
    'accountHolder', a.account_holder,
    'type', a.type,
    'channel', 'qris',
    'qrisImagePath', q.image_path
  )
  from public.branch_qris_codes q
  join public.public_payment_accounts a on a.id = q.linked_account_id
  join public.branches b on b.id = q.branch_id
  where q.branch_id = p_branch_id
    and q.is_active = true
    and b.is_active = true
    and a.is_active = true
    and a.type = 'bank_transfer'
$$;
revoke execute on function private.storefront_qris_account(text) from public, anon, authenticated;

-- Owner only. p_image_path must already be uploaded to store-assets/qris/.
create or replace function public.save_branch_qris(
  p_branch_id text,
  p_image_path text,
  p_linked_account_id text,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.branch_qris_codes%rowtype;
begin
  if (select auth.uid()) is null or private.current_staff_role() is distinct from 'owner' then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(p_image_path, '') !~ '^qris/[A-Za-z0-9._-]+$'
     or not exists (select 1 from storage.objects where bucket_id = 'store-assets' and name = p_image_path) then
    raise exception 'QRIS_IMAGE_REQUIRED' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.public_payment_accounts
    where id = p_linked_account_id and type = 'bank_transfer' and is_active = true
  ) then
    raise exception 'QRIS_LINKED_ACCOUNT_INVALID' using errcode = '22023';
  end if;

  insert into public.branch_qris_codes(branch_id, image_path, linked_account_id, is_active, updated_by, updated_at)
  values (p_branch_id, p_image_path, p_linked_account_id, coalesce(p_is_active, true), (select auth.uid()), now())
  on conflict (branch_id) do update set
    image_path = excluded.image_path,
    linked_account_id = excluded.linked_account_id,
    is_active = excluded.is_active,
    updated_by = excluded.updated_by,
    updated_at = now()
  returning * into v_row;

  perform private.write_business_activity(
    'finance', p_branch_id, p_branch_id, 'branch_qris_saved',
    'Branch QRIS saved.',
    jsonb_build_object('linkedAccountId', v_row.linked_account_id, 'isActive', v_row.is_active)
  );

  return jsonb_build_object(
    'branchId', v_row.branch_id, 'imagePath', v_row.image_path,
    'linkedAccountId', v_row.linked_account_id, 'isActive', v_row.is_active
  );
end;
$$;
revoke execute on function public.save_branch_qris(text, text, text, boolean) from public, anon;
grant execute on function public.save_branch_qris(text, text, text, boolean) to authenticated;

create or replace function public.delete_branch_qris(p_branch_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_staff_role() is distinct from 'owner' then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  delete from public.branch_qris_codes where branch_id = p_branch_id;
  perform private.write_business_activity('finance', p_branch_id, p_branch_id, 'branch_qris_removed', 'Branch QRIS removed.', '{}'::jsonb);
end;
$$;
revoke execute on function public.delete_branch_qris(text) from public, anon;
grant execute on function public.delete_branch_qris(text) to authenticated;

-- Checkout: latest definitions, unchanged except the QRIS payment choice.
create or replace function public.quote_storefront_checkout(
  p_idempotency_key text,
  p_customer jsonb,
  p_branch_id text,
  p_fulfillment text,
  p_schedule_date date,
  p_schedule_time time without time zone,
  p_items jsonb,
  p_delivery_address text default null,
  p_delivery_instructions text default null,
  p_order_note text default null,
  p_greeting_message text default null,
  p_greeting_card_name text default null,
  p_payment_method text default 'transfer',
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote jsonb;
  v_customer_id text;
  v_reward private.customer_review_rewards%rowtype;
  v_items bigint;
  v_current_discount bigint;
  v_reward_discount bigint;
begin
  -- 'qris' = pay the branch QRIS; still a transfer (proof upload, Finance
  -- verification) into the QRIS's linked bank account.
  if lower(trim(coalesce(p_payment_method, 'transfer'))) not in ('transfer', 'qris') then
    raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode = '22023';
  end if;
  if lower(trim(coalesce(p_payment_method, 'transfer'))) = 'qris' then
    if private.storefront_qris_account(p_branch_id) is null then
      raise exception 'STOREFRONT_QRIS_UNAVAILABLE' using errcode = '22023';
    end if;
  elsif private.default_storefront_payment_account(p_branch_id) is null then
    raise exception 'STOREFRONT_PAYMENT_ACCOUNT_UNAVAILABLE' using errcode = '22023';
  end if;

  v_quote := public.quote_storefront_checkout_pre_cashflow(
    p_idempotency_key,p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,
    p_items,p_delivery_address,p_delivery_instructions,p_order_note,p_greeting_message,
    p_greeting_card_name,'transfer',p_promo_code
  );

  select c.id into v_customer_id
  from public.customers c
  where c.normalized_whatsapp_number = private.normalize_whatsapp(p_customer->>'whatsappNumber')
  limit 1;

  if v_customer_id is null then
    return v_quote || jsonb_build_object('reviewRewardApplied', false);
  end if;

  v_items := coalesce((v_quote->>'itemsSubtotalIdr')::bigint, 0);
  v_current_discount := coalesce((v_quote->>'discountIdr')::bigint, 0);

  select * into v_reward
  from private.customer_review_rewards r
  where r.customer_id = v_customer_id
    and r.status = 'available'
    and r.min_order_idr <= v_items
  order by r.issued_at, r.id
  limit 1;

  if not found then
    return v_quote || jsonb_build_object('reviewRewardApplied', false);
  end if;

  v_reward_discount := least(v_items, round(v_items * v_reward.percent_off / 100.0)::bigint);
  if v_reward_discount <= v_current_discount then
    return v_quote || jsonb_build_object('reviewRewardApplied', false);
  end if;

  return v_quote || jsonb_build_object(
    'discountIdr', v_reward_discount,
    'totalIdr', greatest(0, v_items - v_reward_discount + coalesce((v_quote->>'deliveryFeeIdr')::bigint,0)),
    'promoCode', null,
    'promoAccepted', false,
    'promoMessage', null,
    'reviewRewardApplied', true,
    'reviewRewardPercentOff', v_reward.percent_off,
    'reviewRewardMinOrderIdr', v_reward.min_order_idr
  );
end;
$$;

create or replace function public.create_storefront_order(
  p_idempotency_key text,
  p_customer jsonb,
  p_branch_id text,
  p_fulfillment text,
  p_schedule_date date,
  p_schedule_time time without time zone,
  p_items jsonb,
  p_delivery_address text default null,
  p_delivery_instructions text default null,
  p_order_note text default null,
  p_greeting_message text default null,
  p_greeting_card_name text default null,
  p_payment_method text default 'transfer',
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account jsonb;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_reward private.customer_review_rewards%rowtype;
  v_reward_discount bigint;
  v_is_dedup boolean;
  v_auto_promo jsonb;
  v_effective_promo_code text;
begin
  -- A retry of an order that already exists must still return it, so only new
  -- idempotency keys spend the per-IP checkout budget.
  if not exists (
    select 1 from public.orders o
    where o.storefront_idempotency_key = trim(coalesce(p_idempotency_key, ''))
  ) then
    perform private.consume_public_checkout_budget();
  end if;

  -- 'qris' = pay the branch QRIS; recorded as a transfer whose account
  -- snapshot is the QRIS's linked bank account (+ channel 'qris'), so proof
  -- upload, verification and reconciliation work unchanged.
  if lower(trim(coalesce(p_payment_method, 'transfer'))) not in ('transfer', 'qris') then
    raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode = '22023';
  end if;

  if lower(trim(coalesce(p_payment_method, 'transfer'))) = 'qris' then
    v_account := private.storefront_qris_account(p_branch_id);
    if v_account is null then
      raise exception 'STOREFRONT_QRIS_UNAVAILABLE' using errcode = '22023';
    end if;
  else
    v_account := private.default_storefront_payment_account(p_branch_id);
    if v_account is null then
      raise exception 'STOREFRONT_PAYMENT_ACCOUNT_UNAVAILABLE' using errcode = '22023';
    end if;
  end if;

  v_result := public.create_storefront_order_pre_cashflow(
    p_idempotency_key,p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,
    p_items,p_delivery_address,p_delivery_instructions,p_order_note,p_greeting_message,
    p_greeting_card_name,'transfer',p_promo_code
  );
  v_is_dedup := coalesce((v_result->>'deduplicated')::boolean, false);

  select * into v_order from public.orders where id = v_result->>'orderId' for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;

  if not v_is_dedup then
    if nullif(trim(coalesce(p_promo_code, '')), '') is null
       and v_order.promo_code is null
       and v_order.discount_idr > 0 then
      v_auto_promo := private.resolve_voucher_discount(
        p_customer,
        v_order.items_subtotal_idr,
        null
      );
      if coalesce((v_auto_promo->>'promoAccepted')::boolean, false)
         and coalesce((v_auto_promo->>'discountIdr')::bigint, 0) = v_order.discount_idr then
        v_effective_promo_code := nullif(
          upper(trim(coalesce(v_auto_promo->>'promoCode', ''))),
          ''
        );
      end if;
    end if;

    update public.orders
    set payment_method = 'transfer',
        payment_account_snapshot = v_account,
        promo_code = coalesce(v_order.promo_code, v_effective_promo_code),
        updated_at = now()
    where id = v_order.id
    returning * into v_order;

    select * into v_reward
    from private.customer_review_rewards r
    where r.customer_id = v_order.customer_id
      and r.status = 'available'
      and r.min_order_idr <= v_order.items_subtotal_idr
    order by r.issued_at, r.id
    limit 1
    for update;

    if found then
      v_reward_discount := least(
        v_order.items_subtotal_idr,
        round(v_order.items_subtotal_idr * v_reward.percent_off / 100.0)::bigint
      );
      if v_reward_discount > v_order.discount_idr then
        update public.orders
        set discount_idr = v_reward_discount,
            total_idr = greatest(0, items_subtotal_idr - v_reward_discount + delivery_fee_idr),
            promo_code = null,
            review_reward_id = v_reward.id,
            updated_at = now()
        where id = v_order.id
        returning * into v_order;

        update private.customer_review_rewards
        set status = 'redeemed', redeemed_order_id = v_order.id, redeemed_at = now()
        where id = v_reward.id and status = 'available';
      end if;
    end if;
  end if;

  return private.order_idempotency_result(v_order, v_is_dedup);
end;
$function$;

notify pgrst, 'reload schema';

commit;
