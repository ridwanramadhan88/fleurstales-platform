-- Finance cash flow, account-linked order payments, secure readable tracking,
-- customer reviews, and one-time review rewards.
--
-- This migration intentionally keeps the existing opaque public_tracking_id
-- introduced by PR #22 as the tracking secret. The human-readable order number
-- is presentation context only.

begin;

-- ---------------------------------------------------------------------------
-- Order/payment contract additions.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists payment_account_snapshot jsonb,
  add column if not exists review_reward_id text;

alter table public.order_payment_events
  add column if not exists finance_account_id text;

-- ---------------------------------------------------------------------------
-- Review + reward authority lives in private schema. Public clients only use
-- narrow RPCs below; no review/reward table is exposed directly to Data API.
-- ---------------------------------------------------------------------------
create table if not exists private.review_questions (
  id text primary key,
  question text not null check (length(trim(question)) between 1 and 160),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists private.review_reward_settings (
  id text primary key check (id = 'primary'),
  enabled boolean not null default true,
  percent_off numeric(5,2) not null default 10 check (percent_off > 0 and percent_off <= 100),
  min_order_idr bigint not null default 300000 check (min_order_idr >= 0),
  revision bigint not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists private.order_reviews (
  id text primary key,
  order_id text not null unique references public.orders(id) on delete cascade,
  order_number text not null,
  customer_id text not null references public.customers(id) on delete cascade,
  note text,
  submitted_at timestamptz not null default now()
);

create table if not exists private.order_review_answers (
  review_id text not null references private.order_reviews(id) on delete cascade,
  question_id text not null,
  question_snapshot text not null,
  score integer not null check (score between 1 and 5),
  primary key (review_id, question_id)
);

create table if not exists private.customer_review_rewards (
  id text primary key,
  customer_id text not null references public.customers(id) on delete cascade,
  source_order_id text not null unique references public.orders(id) on delete cascade,
  source_review_id text not null unique references private.order_reviews(id) on delete cascade,
  percent_off numeric(5,2) not null check (percent_off > 0 and percent_off <= 100),
  min_order_idr bigint not null check (min_order_idr >= 0),
  status text not null default 'available' check (status in ('available','redeemed')),
  issued_at timestamptz not null default now(),
  redeemed_order_id text references public.orders(id) on delete set null,
  redeemed_at timestamptz
);

create index if not exists customer_review_rewards_available_idx
  on private.customer_review_rewards(customer_id, issued_at)
  where status = 'available';

revoke all on table
  private.review_questions,
  private.review_reward_settings,
  private.order_reviews,
  private.order_review_answers,
  private.customer_review_rewards
from public, anon, authenticated;

insert into private.review_questions(id, question, display_order, is_active)
values
  ('review_product_quality', 'Kualitas produk', 10, true),
  ('review_service', 'Pelayanan', 20, true),
  ('review_fulfillment', 'Pengiriman / Pickup', 30, true)
on conflict (id) do nothing;

insert into private.review_reward_settings(id, enabled, percent_off, min_order_idr)
values ('primary', true, 10, 300000)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Finance account helpers.
-- Bank/e-wallet IDs reuse public_payment_accounts.id. Cash is the one built-in
-- source `cash:main` and is never exposed as a Storefront checkout choice.
-- ---------------------------------------------------------------------------
create or replace function private.finance_account_is_valid(p_account_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_account_id = 'cash:main' then true
    else exists(
      select 1
      from public.public_payment_accounts a
      where a.id = p_account_id and a.is_active = true
    )
  end
$$;
revoke execute on function private.finance_account_is_valid(text) from public, anon, authenticated;

create or replace function private.default_storefront_payment_account(p_branch_id text)
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
    'type', a.type
  )
  from public.public_payment_accounts a
  where a.is_active = true
    and a.is_customer_visible = true
    and (cardinality(a.branch_ids) = 0 or p_branch_id = any(a.branch_ids))
  order by a.is_default desc, a.display_order asc, a.id asc
  limit 1
$$;
revoke execute on function private.default_storefront_payment_account(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storefront is Transfer-only. Reuse the proven checkout creators, but guard
-- payment method and snapshot the exact account shown to the customer.
-- ---------------------------------------------------------------------------
alter function public.quote_storefront_checkout(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) rename to quote_storefront_checkout_pre_cashflow;
revoke execute on function public.quote_storefront_checkout_pre_cashflow(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, anon, authenticated;

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
  if lower(trim(coalesce(p_payment_method, 'transfer'))) <> 'transfer' then
    raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode = '22023';
  end if;
  if private.default_storefront_payment_account(p_branch_id) is null then
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
revoke execute on function public.quote_storefront_checkout(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, authenticated;
grant execute on function public.quote_storefront_checkout(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) to anon, service_role;

alter function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) rename to create_storefront_order_pre_cashflow;
revoke execute on function public.create_storefront_order_pre_cashflow(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, anon, authenticated;

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
as $$
declare
  v_account jsonb;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_reward private.customer_review_rewards%rowtype;
  v_reward_discount bigint;
  v_is_dedup boolean;
begin
  if lower(trim(coalesce(p_payment_method, 'transfer'))) <> 'transfer' then
    raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode = '22023';
  end if;

  v_account := private.default_storefront_payment_account(p_branch_id);
  if v_account is null then
    raise exception 'STOREFRONT_PAYMENT_ACCOUNT_UNAVAILABLE' using errcode = '22023';
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
    update public.orders
    set payment_method = 'transfer',
        payment_account_snapshot = v_account,
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
$$;
revoke execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, authenticated;
grant execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) to anon, service_role;

-- ---------------------------------------------------------------------------
-- Internal/admin-created orders no longer accept partial/deposit or pre-post
-- payment. Payment is confirmed at Process Order before production starts.
-- ---------------------------------------------------------------------------
alter function public.create_internal_order(jsonb) rename to create_internal_order_pre_cashflow;
revoke execute on function public.create_internal_order_pre_cashflow(jsonb) from public, anon, authenticated;

create or replace function public.create_internal_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_payload->>'paymentStatus','unpaid') <> 'unpaid'
     or coalesce((p_payload->>'depositAmountIdr')::bigint,0) <> 0 then
    raise exception 'PAYMENT_CONFIRMED_DURING_PROCESS_ORDER' using errcode='22023';
  end if;
  return public.create_internal_order_pre_cashflow(p_payload);
end;
$$;
revoke execute on function public.create_internal_order(jsonb) from public, anon;
grant execute on function public.create_internal_order(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Finance-only operational-domain read/write boundary.
-- ---------------------------------------------------------------------------
create or replace function private.can_read_operational_domain(p_domain text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_domain
    when 'hr' then private.has_section_access('hr','view')
    when 'payroll' then private.has_action_permission('hr.create_payroll_proposal')
      or private.has_action_permission('hr.edit_payroll_proposal')
      or private.has_action_permission('hr.resolve_rejected_employee')
      or private.has_action_permission('finance.view_payroll')
    when 'finance' then private.current_staff_role() = 'finance'
      and private.has_action_permission('finance.view_ledger')
    when 'stock' then private.feature_enabled('inventory') and private.has_section_access('stock','view')
    when 'vouchers' then private.has_section_access('finance','view') or private.has_section_access('orders','edit')
    when 'order_drafts' then private.has_action_permission('orders.create') or private.has_action_permission('orders.edit')
    else false
  end;
end;
$$;
revoke execute on function private.can_read_operational_domain(text) from public, anon, authenticated;

alter function public.save_finance_operational_state(bigint,jsonb)
  rename to save_finance_operational_state_pre_finance_only;
revoke execute on function public.save_finance_operational_state_pre_finance_only(bigint,jsonb)
  from public, anon, authenticated;

create or replace function public.save_finance_operational_state(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_staff_role() <> 'finance' then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501';
  end if;
  return public.save_finance_operational_state_pre_finance_only(p_expected_revision,p_snapshot);
end;
$$;
revoke execute on function public.save_finance_operational_state(bigint,jsonb) from public, anon;
grant execute on function public.save_finance_operational_state(bigint,jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Order → Finance projection. New verified payments carry accountId and use
-- the exact payment verification timestamp. Refunds inherit original account.
-- ---------------------------------------------------------------------------
create or replace function private.sync_order_finance_transactions(p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_state private.operational_domain_state%rowtype;
  v_transactions jsonb;
  v_original_transactions jsonb;
  v_event public.order_payment_events%rowtype;
  v_tx jsonb;
  v_tx_id text;
  v_account_id text;
begin
  select * into v_order from public.orders where id=p_order_id;
  if not found then return; end if;

  select * into v_state from private.operational_domain_state where domain='finance' for update;
  if not found then
    insert into private.operational_domain_state(domain,revision,snapshot,updated_at)
    values('finance',1,'{"transactions":[],"customCategories":[],"categoryOverrides":[]}'::jsonb,now())
    returning * into v_state;
  end if;

  v_transactions := coalesce(v_state.snapshot->'transactions','[]'::jsonb);
  v_original_transactions := v_transactions;

  for v_event in
    select * from public.order_payment_events
    where order_id=p_order_id
    order by occurred_at, id
  loop
    if v_event.type not in ('payment_received','refund_completed') or v_event.amount_idr <= 0 then
      continue;
    end if;

    v_account_id := v_event.finance_account_id;
    if v_event.type='refund_completed' and v_account_id is null then
      select e.finance_account_id into v_account_id
      from public.order_payment_events e
      where e.order_id=p_order_id
        and e.type='payment_received'
        and e.finance_account_id is not null
      order by e.occurred_at desc, e.id desc
      limit 1;
    end if;

    if v_event.ledger_transaction_id is null then
      v_tx_id := 'txn_'||replace(gen_random_uuid()::text,'-','');
      v_tx := jsonb_strip_nulls(jsonb_build_object(
        'id',v_tx_id,
        'type',case when v_event.type='refund_completed' then 'expense' else 'income' end,
        'category',case when v_event.type='refund_completed' then 'order_refund' else case when v_order.source='walk_in' then 'walk_in_sale' else 'order_payment' end end,
        'branch',v_order.branch_id,
        'scope','branch',
        'accountId',coalesce(v_account_id,'legacy:unassigned'),
        'amount',v_event.amount_idr,
        'method',coalesce(v_event.method,'other'),
        'status',case when v_event.type='refund_completed' or v_account_id is not null then 'verified' else 'pending' end,
        'name',case when v_event.type='refund_completed' then 'Order refund' else 'Order payment' end,
        'description',coalesce(v_event.note,''),
        'orderNumber',v_order.order_number,
        'reference',v_event.reference,
        'source',case when v_event.type='refund_completed' then 'order_refund' else 'order_payment' end,
        'entryMode','automatic',
        'transactionDate',v_event.occurred_at,
        'groupType',case when v_event.type='refund_completed' then 'refund_day' else 'order_day' end,
        'groupKey',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
        'groupLabel',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
        'sourceEventId',v_event.id,
        'idempotencyKey',v_event.idempotency_key,
        'isSystemGenerated',true,
        'actor',coalesce(v_event.actor_name,'System'),
        'createdAt',v_event.occurred_at,
        'updatedAt',now()
      ));
      if not exists(select 1 from jsonb_array_elements(v_transactions) x where x->>'idempotencyKey'=v_event.idempotency_key) then
        v_transactions := jsonb_build_array(v_tx)||v_transactions;
      else
        select x->>'id' into v_tx_id
        from jsonb_array_elements(v_transactions) x
        where x->>'idempotencyKey'=v_event.idempotency_key
        limit 1;
      end if;
      update public.order_payment_events
      set ledger_transaction_id=v_tx_id,
          finance_account_id=coalesce(finance_account_id,v_account_id)
      where id=v_event.id;
    elsif v_account_id is not null then
      select coalesce(jsonb_agg(
        case when x->>'sourceEventId'=v_event.id then
          x || jsonb_build_object(
            'accountId',v_account_id,
            'status','verified',
            'transactionDate',v_event.occurred_at,
            'groupKey',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
            'groupLabel',to_char(timezone('Asia/Jakarta',v_event.occurred_at),'YYYY-MM-DD'),
            'updatedAt',now()
          )
        else x end
      ),'[]'::jsonb)
      into v_transactions
      from jsonb_array_elements(v_transactions) x;
    end if;
  end loop;

  if v_transactions is distinct from v_original_transactions then
    update private.operational_domain_state
    set revision=revision+1,
        snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),
        updated_by=(select auth.uid()),
        updated_at=now()
    where domain='finance';
    perform private.write_business_activity(
      'finance',p_order_id,v_order.branch_id,'order_ledger_synced',
      'Order payment/refund synchronized to Finance.',
      jsonb_build_object('orderNumber',v_order.order_number)
    );
  end if;
end;
$$;
revoke execute on function private.sync_order_finance_transactions(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin payment verification performed immediately before production starts.
-- It is idempotent: one order gets one process-payment event/ledger posting.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_order_payment_for_processing(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_role text := private.current_staff_role();
  v_employee_id text := private.current_staff_employee_id();
  v_actor_name text;
  v_account_id text := trim(coalesce(p_finance_account_id,''));
  v_event public.order_payment_events%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_role not in ('owner','admin') or not private.has_action_permission('orders.advance_status') then
    raise exception 'PROCESS_PAYMENT_NOT_PERMITTED' using errcode='42501';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_order.revision using errcode='40001';
  end if;
  if v_order.status <> 'confirmed' then
    raise exception 'ORDER_MUST_BE_CONFIRMED_BEFORE_PROCESSING' using errcode='22023';
  end if;
  if v_order.payment_status='partial' then
    raise exception 'PARTIAL_PAYMENT_NOT_SUPPORTED' using errcode='22023';
  end if;

  if v_order.payment_method='cash' then
    if v_order.storefront_idempotency_key is not null or v_order.source='customer_app' then
      raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode='22023';
    end if;
    v_account_id := 'cash:main';
  else
    if v_order.payment_method is distinct from 'transfer' then
      raise exception 'PAYMENT_METHOD_REQUIRED' using errcode='22023';
    end if;
    if not exists(
      select 1 from public.public_payment_accounts a
      where a.id=v_account_id and a.is_active=true
        and (cardinality(a.branch_ids)=0 or v_order.branch_id=any(a.branch_ids))
    ) then
      raise exception 'VALID_RECEIVING_ACCOUNT_REQUIRED' using errcode='22023';
    end if;
  end if;

  select display_name into v_actor_name
  from public.staff_access_profiles
  where employee_id=v_employee_id and is_active=true
  limit 1;
  v_actor_name := coalesce(nullif(trim(v_actor_name),''),v_role,'Admin');

  select * into v_event
  from public.order_payment_events
  where order_id=v_order.id and type='payment_received'
  order by occurred_at desc, id desc
  limit 1
  for update;

  if v_order.payment_status='paid' and found then
    update public.order_payment_events
    set finance_account_id=v_account_id,
        occurred_at=v_now,
        actor_id=v_employee_id,
        actor_name=v_actor_name,
        note='Full payment verified before production start'
    where id=v_event.id
    returning * into v_event;
  else
    if v_order.payment_status <> 'unpaid' then
      raise exception 'ORDER_PAYMENT_STATE_INVALID' using errcode='22023';
    end if;
    insert into public.order_payment_events(
      id,order_id,type,amount_idr,previous_paid_amount_idr,resulting_paid_amount_idr,
      resulting_status,method,note,actor_id,actor_name,occurred_at,idempotency_key,
      finance_account_id
    ) values (
      'pay_'||replace(gen_random_uuid()::text,'-',''),
      v_order.id,'payment_received',v_order.total_idr,0,v_order.total_idr,
      'paid',v_order.payment_method,'Full payment verified before production start',
      v_employee_id,v_actor_name,v_now,'process-payment:'||v_order.id,v_account_id
    )
    on conflict (idempotency_key) do update
      set finance_account_id=excluded.finance_account_id,
          actor_id=excluded.actor_id,
          actor_name=excluded.actor_name,
          occurred_at=excluded.occurred_at,
          note=excluded.note
    returning * into v_event;
  end if;

  update public.orders
  set payment_status='paid',
      paid_amount_idr=total_idr,
      revision=revision+1,
      updated_at=v_now
  where id=v_order.id
  returning * into v_order;

  perform private.sync_order_finance_transactions(v_order.id);
  perform private.write_business_activity(
    'order',v_order.id,v_order.branch_id,'payment_verified_for_processing',
    'Full payment verified before production start.',
    jsonb_build_object('orderNumber',v_order.order_number,'financeAccountId',v_account_id,'amountIdr',v_order.total_idr)
  );

  return jsonb_build_object(
    'orderId',v_order.id,
    'orderNumber',v_order.order_number,
    'revision',v_order.revision,
    'paymentStatus',v_order.payment_status,
    'paidAmountIdr',v_order.paid_amount_idr,
    'financeAccountId',v_account_id,
    'paymentVerifiedAt',v_now,
    'ledgerTransactionId',v_event.ledger_transaction_id
  );
end;
$$;
revoke execute on function public.confirm_order_payment_for_processing(text,integer,text) from public, anon;
grant execute on function public.confirm_order_payment_for_processing(text,integer,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Finance account balance operations. These write the same operational Finance
-- ledger so existing persistence/export flows keep working.
-- ---------------------------------------------------------------------------
create or replace function public.create_finance_cashflow_entry(
  p_expected_revision bigint,
  p_kind text,
  p_account_id text,
  p_amount bigint,
  p_direction text default null,
  p_counterparty_account_id text default null,
  p_transaction_date timestamptz default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_transactions jsonb;
  v_tx jsonb;
  v_tx2 jsonb;
  v_id text := 'txn_'||replace(gen_random_uuid()::text,'-','');
  v_transfer_id text := 'transfer_'||replace(gen_random_uuid()::text,'-','');
  v_date timestamptz := coalesce(p_transaction_date,clock_timestamp());
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_kind text := lower(trim(coalesce(p_kind,'')));
  v_direction text := lower(trim(coalesce(p_direction,'')));
begin
  if (select auth.uid()) is null or private.current_staff_role()<>'finance' then
    raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501';
  end if;
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  if p_amount<=0 then raise exception 'AMOUNT_MUST_BE_POSITIVE' using errcode='22023'; end if;
  if not private.finance_account_is_valid(p_account_id) then raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023'; end if;

  select * into v_state from private.operational_domain_state where domain='finance' for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode='55000'; end if;
  if v_state.revision<>p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_state.revision using errcode='40001';
  end if;
  v_transactions:=coalesce(v_state.snapshot->'transactions','[]'::jsonb);

  if v_kind='opening_balance' then
    if v_note is null then raise exception 'OPENING_BALANCE_REASON_REQUIRED' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(v_transactions) x where x->>'source'='opening_balance' and x->>'accountId'=p_account_id) then
      raise exception 'OPENING_BALANCE_ALREADY_EXISTS' using errcode='22023';
    end if;
    v_tx:=jsonb_build_object(
      'id',v_id,'type','income','category','owner_deposit','branch','All','scope','company',
      'accountId',p_account_id,'amount',p_amount,'method',case when p_account_id='cash:main' then 'cash' else 'transfer' end,
      'status','verified','name','Opening balance','description',v_note,'note',v_note,
      'source','opening_balance','entryMode','manual','transactionDate',v_date,
      'isSystemGenerated',false,'actor',v_profile.display_name,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()
    );
    v_transactions:=jsonb_build_array(v_tx)||v_transactions;
  elsif v_kind='adjustment' then
    if v_note is null then raise exception 'ADJUSTMENT_REASON_REQUIRED' using errcode='22023'; end if;
    if v_direction not in ('income','expense') then raise exception 'ADJUSTMENT_DIRECTION_INVALID' using errcode='22023'; end if;
    v_tx:=jsonb_build_object(
      'id',v_id,'type',v_direction,'category',case when v_direction='income' then 'other_income' else 'other' end,
      'branch','All','scope','company','accountId',p_account_id,'amount',p_amount,
      'method',case when p_account_id='cash:main' then 'cash' else 'transfer' end,
      'status','verified','name','Balance adjustment','description',v_note,'note',v_note,
      'adjustmentReason',v_note,'source','adjustment','entryMode','manual','transactionDate',v_date,
      'isSystemGenerated',false,'actor',v_profile.display_name,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()
    );
    v_transactions:=jsonb_build_array(v_tx)||v_transactions;
  elsif v_kind='transfer' then
    if p_counterparty_account_id is null or p_counterparty_account_id=p_account_id then
      raise exception 'TRANSFER_DESTINATION_INVALID' using errcode='22023';
    end if;
    if not private.finance_account_is_valid(p_counterparty_account_id) then
      raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023';
    end if;
    v_tx:=jsonb_build_object(
      'id',v_id,'type','expense','category','other','branch','All','scope','company',
      'accountId',p_account_id,'amount',p_amount,'method',case when p_account_id='cash:main' then 'cash' else 'transfer' end,
      'status','verified','name','Account transfer','description',coalesce(v_note,''),'note',v_note,
      'source','transfer','transferId',v_transfer_id,'transferDirection','out','entryMode','manual','transactionDate',v_date,
      'isSystemGenerated',false,'actor',v_profile.display_name,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()
    );
    v_tx2:=jsonb_build_object(
      'id','txn_'||replace(gen_random_uuid()::text,'-',''),'type','income','category','other_income','branch','All','scope','company',
      'accountId',p_counterparty_account_id,'amount',p_amount,'method',case when p_counterparty_account_id='cash:main' then 'cash' else 'transfer' end,
      'status','verified','name','Account transfer','description',coalesce(v_note,''),'note',v_note,
      'source','transfer','transferId',v_transfer_id,'transferDirection','in','entryMode','manual','transactionDate',v_date,
      'isSystemGenerated',false,'actor',v_profile.display_name,'createdAt',clock_timestamp(),'updatedAt',clock_timestamp()
    );
    v_transactions:=jsonb_build_array(v_tx2,v_tx)||v_transactions;
  else
    raise exception 'FINANCE_CASHFLOW_KIND_INVALID' using errcode='22023';
  end if;

  update private.operational_domain_state
  set revision=revision+1,
      snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),
      updated_by=(select auth.uid()),updated_at=now()
  where domain='finance'
  returning * into v_state;

  perform private.write_business_activity('finance',v_id,null,'cashflow_entry_created','Finance cash-flow entry created.',jsonb_build_object('kind',v_kind,'accountId',p_account_id,'amount',p_amount));
  return jsonb_build_object('domain','finance','revision',v_state.revision,'snapshot',v_state.snapshot,'updatedAt',v_state.updated_at);
end;
$$;
revoke execute on function public.create_finance_cashflow_entry(bigint,text,text,bigint,text,text,timestamptz,text) from public, anon;
grant execute on function public.create_finance_cashflow_entry(bigint,text,text,bigint,text,text,timestamptz,text) to authenticated, service_role;

create or replace function public.edit_finance_transaction(
  p_expected_revision bigint,
  p_transaction_id text,
  p_patch jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_transactions jsonb;
  v_tx jsonb;
  v_next jsonb;
  v_reason text:=trim(coalesce(p_reason,''));
  v_account text;
  v_amount bigint;
begin
  if (select auth.uid()) is null or private.current_staff_role()<>'finance' then raise exception 'FINANCE_ROLE_REQUIRED' using errcode='42501'; end if;
  if length(v_reason)<3 then raise exception 'EDIT_REASON_REQUIRED' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_patch,'{}'::jsonb))<>'object' then raise exception 'INVALID_PATCH' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k(key) where key not in ('accountId','amount','transactionDate','category','method','name','description','note','reference')) then
    raise exception 'FINANCE_PATCH_FIELD_NOT_ALLOWED' using errcode='22023';
  end if;

  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  select * into v_state from private.operational_domain_state where domain='finance' for update;
  if not found then raise exception 'FINANCE_STATE_NOT_INITIALIZED' using errcode='55000'; end if;
  if v_state.revision<>p_expected_revision then raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_state.revision using errcode='40001'; end if;
  v_transactions:=coalesce(v_state.snapshot->'transactions','[]'::jsonb);
  select value into v_tx from jsonb_array_elements(v_transactions) where value->>'id'=p_transaction_id limit 1;
  if v_tx is null then raise exception 'FINANCE_TRANSACTION_NOT_FOUND' using errcode='P0002'; end if;
  if v_tx->>'source'='transfer' then raise exception 'EDIT_TRANSFER_AS_PAIR_REQUIRED' using errcode='22023'; end if;

  v_account:=coalesce(nullif(p_patch->>'accountId',''),v_tx->>'accountId');
  if v_account is not null and v_account<>'legacy:unassigned' and not private.finance_account_is_valid(v_account) then raise exception 'FINANCE_ACCOUNT_INVALID' using errcode='22023'; end if;
  v_amount:=coalesce((p_patch->>'amount')::bigint,(v_tx->>'amount')::bigint);
  if v_amount<=0 then raise exception 'AMOUNT_MUST_BE_POSITIVE' using errcode='22023'; end if;

  v_next:=v_tx || jsonb_strip_nulls(jsonb_build_object(
    'accountId',v_account,
    'amount',v_amount,
    'transactionDate',coalesce(nullif(p_patch->>'transactionDate',''),v_tx->>'transactionDate'),
    'category',coalesce(nullif(p_patch->>'category',''),v_tx->>'category'),
    'method',coalesce(nullif(p_patch->>'method',''),v_tx->>'method'),
    'name',coalesce(p_patch->>'name',v_tx->>'name'),
    'description',coalesce(p_patch->>'description',v_tx->>'description'),
    'note',coalesce(p_patch->>'note',v_tx->>'note'),
    'reference',coalesce(p_patch->>'reference',v_tx->>'reference'),
    'updatedAt',clock_timestamp(),
    'updatedBy',v_profile.display_name,
    'revision',coalesce((v_tx->>'revision')::integer,1)+1,
    'editHistory',coalesce(v_tx->'editHistory','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'revision',coalesce((v_tx->>'revision')::integer,1)+1,
      'editedAt',clock_timestamp(),
      'editedBy',v_profile.display_name,
      'reason',v_reason,
      'previous',v_tx - 'editHistory'
    ))
  ));

  select coalesce(jsonb_agg(case when x->>'id'=p_transaction_id then v_next else x end),'[]'::jsonb)
  into v_transactions from jsonb_array_elements(v_transactions) x;

  update private.operational_domain_state
  set revision=revision+1,snapshot=jsonb_set(snapshot,'{transactions}',v_transactions,true),updated_by=(select auth.uid()),updated_at=now()
  where domain='finance'
  returning * into v_state;

  perform private.write_business_activity('finance',p_transaction_id,null,'finance_transaction_edited','Finance transaction edited.',jsonb_build_object('reason',v_reason));
  return jsonb_build_object('domain','finance','revision',v_state.revision,'snapshot',v_state.snapshot,'updatedAt',v_state.updated_at);
end;
$$;
revoke execute on function public.edit_finance_transaction(bigint,text,jsonb,text) from public, anon;
grant execute on function public.edit_finance_transaction(bigint,text,jsonb,text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Secure readable tracking route support: order number + WhatsApp can recover
-- the existing opaque UUID. The UUID remains required for full details.
-- ---------------------------------------------------------------------------
create or replace function public.verify_order_tracking_access(
  p_order_number text,
  p_whatsapp_number text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  perform private.consume_public_order_lookup_budget();
  select * into v_order
  from public.orders o
  where upper(o.order_number)=upper(trim(p_order_number))
    and o.source='customer_app'
    and private.normalize_whatsapp(o.customer_whatsapp_snapshot)=private.normalize_whatsapp(p_whatsapp_number)
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object('orderNumber',v_order.order_number,'publicTrackingId',v_order.public_tracking_id::text);
end;
$$;
revoke execute on function public.verify_order_tracking_access(text,text) from public, authenticated;
grant execute on function public.verify_order_tracking_access(text,text) to anon, service_role;

-- ---------------------------------------------------------------------------
-- Review admin configuration.
-- ---------------------------------------------------------------------------
create or replace function public.get_review_configuration()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text:=private.current_staff_role();
  v_reward private.review_reward_settings%rowtype;
begin
  if (select auth.uid()) is null or v_role not in ('owner','admin','finance') then raise exception 'REVIEW_SETTINGS_NOT_PERMITTED' using errcode='42501'; end if;
  select * into v_reward from private.review_reward_settings where id='primary';
  return jsonb_build_object(
    'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'displayOrder',q.display_order,'isActive',q.is_active) order by q.display_order,q.id) from private.review_questions q),'[]'::jsonb),
    'reward',jsonb_build_object('enabled',v_reward.enabled,'percentOff',v_reward.percent_off,'minOrderIdr',v_reward.min_order_idr,'revision',v_reward.revision)
  );
end;
$$;
revoke execute on function public.get_review_configuration() from public, anon;
grant execute on function public.get_review_configuration() to authenticated, service_role;

create or replace function public.save_review_questions(p_questions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_role text:=private.current_staff_role(); v_item jsonb; v_seen integer:=0;
begin
  if (select auth.uid()) is null or v_role not in ('owner','admin') then raise exception 'ADMIN_REVIEW_TEMPLATE_REQUIRED' using errcode='42501'; end if;
  if jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions)>5 then raise exception 'REVIEW_QUESTIONS_INVALID' using errcode='22023'; end if;
  update private.review_questions set is_active=false,updated_at=now(),updated_by=(select auth.uid());
  for v_item in select value from jsonb_array_elements(p_questions) loop
    if nullif(trim(v_item->>'question'),'') is null then raise exception 'REVIEW_QUESTION_REQUIRED' using errcode='22023'; end if;
    v_seen:=v_seen+1;
    insert into private.review_questions(id,question,display_order,is_active,created_at,updated_at,updated_by)
    values(coalesce(nullif(v_item->>'id',''),'review_q_'||replace(gen_random_uuid()::text,'-','')),trim(v_item->>'question'),v_seen*10,coalesce((v_item->>'isActive')::boolean,true),now(),now(),(select auth.uid()))
    on conflict(id) do update set question=excluded.question,display_order=excluded.display_order,is_active=excluded.is_active,updated_at=now(),updated_by=(select auth.uid());
  end loop;
  perform private.write_business_activity('customer','review-template',null,'review_template_updated','Review questions updated.',jsonb_build_object('count',v_seen));
  return public.get_review_configuration();
end;
$$;
revoke execute on function public.save_review_questions(jsonb) from public, anon;
grant execute on function public.save_review_questions(jsonb) to authenticated, service_role;

create or replace function public.save_review_reward_settings(
  p_enabled boolean,
  p_percent_off numeric,
  p_min_order_idr bigint,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_role text:=private.current_staff_role(); v_row private.review_reward_settings%rowtype;
begin
  if (select auth.uid()) is null or v_role not in ('owner','admin','finance') then raise exception 'PROMO_SETTINGS_NOT_PERMITTED' using errcode='42501'; end if;
  if p_percent_off<=0 or p_percent_off>100 or p_min_order_idr<0 then raise exception 'REVIEW_REWARD_INVALID' using errcode='22023'; end if;
  select * into v_row from private.review_reward_settings where id='primary' for update;
  if v_row.revision<>p_expected_revision then raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_row.revision using errcode='40001'; end if;
  update private.review_reward_settings set enabled=p_enabled,percent_off=p_percent_off,min_order_idr=p_min_order_idr,revision=revision+1,updated_by=(select auth.uid()),updated_at=now() where id='primary';
  perform private.write_business_activity('customer','review-reward',null,'review_reward_settings_updated','Review reward settings updated.',jsonb_build_object('enabled',p_enabled,'percentOff',p_percent_off,'minOrderIdr',p_min_order_idr));
  return public.get_review_configuration();
end;
$$;
revoke execute on function public.save_review_reward_settings(boolean,numeric,bigint,bigint) from public, anon;
grant execute on function public.save_review_reward_settings(boolean,numeric,bigint,bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public review submission. One completed Storefront order => one review =>
-- at most one reward. Reward values are snapshotted when earned.
-- ---------------------------------------------------------------------------
create or replace function public.submit_order_review(
  p_tracking_id text,
  p_answers jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracking_id uuid;
  v_order public.orders%rowtype;
  v_review_id text:='review_'||replace(gen_random_uuid()::text,'-','');
  v_item jsonb;
  v_question private.review_questions%rowtype;
  v_active_count integer;
  v_reward_settings private.review_reward_settings%rowtype;
  v_reward_id text;
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
  perform private.consume_public_order_lookup_budget();
  begin v_tracking_id:=p_tracking_id::uuid; exception when invalid_text_representation then raise exception 'TRACKING_LINK_INVALID' using errcode='22023'; end;
  if jsonb_typeof(p_answers)<>'array' then raise exception 'REVIEW_ANSWERS_INVALID' using errcode='22023'; end if;
  if v_note is not null and length(v_note)>2000 then raise exception 'REVIEW_NOTE_TOO_LONG' using errcode='22023'; end if;

  select * into v_order from public.orders where public_tracking_id=v_tracking_id and source='customer_app' for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.status not in ('delivered','picked_up') then raise exception 'ORDER_NOT_COMPLETED' using errcode='22023'; end if;
  if v_order.customer_id is null then raise exception 'CUSTOMER_ID_REQUIRED' using errcode='22023'; end if;
  if exists(select 1 from private.order_reviews where order_id=v_order.id) then raise exception 'ORDER_ALREADY_REVIEWED' using errcode='23505'; end if;

  select count(*) into v_active_count from private.review_questions where is_active=true;
  if jsonb_array_length(p_answers)<>v_active_count then raise exception 'ALL_REVIEW_QUESTIONS_REQUIRED' using errcode='22023'; end if;

  insert into private.order_reviews(id,order_id,order_number,customer_id,note,submitted_at)
  values(v_review_id,v_order.id,v_order.order_number,v_order.customer_id,v_note,now());

  for v_item in select value from jsonb_array_elements(p_answers) loop
    select * into v_question from private.review_questions where id=v_item->>'questionId' and is_active=true;
    if not found then raise exception 'REVIEW_QUESTION_INVALID' using errcode='22023'; end if;
    if coalesce((v_item->>'score')::integer,0) not between 1 and 5 then raise exception 'REVIEW_SCORE_INVALID' using errcode='22023'; end if;
    insert into private.order_review_answers(review_id,question_id,question_snapshot,score)
    values(v_review_id,v_question.id,v_question.question,(v_item->>'score')::integer);
  end loop;

  select * into v_reward_settings from private.review_reward_settings where id='primary';
  if v_reward_settings.enabled then
    v_reward_id:='review_reward_'||replace(gen_random_uuid()::text,'-','');
    insert into private.customer_review_rewards(id,customer_id,source_order_id,source_review_id,percent_off,min_order_idr,status,issued_at)
    values(v_reward_id,v_order.customer_id,v_order.id,v_review_id,v_reward_settings.percent_off,v_reward_settings.min_order_idr,'available',now())
    on conflict(source_order_id) do nothing;
  end if;

  return jsonb_build_object(
    'reviewSubmitted',true,
    'reviewId',v_review_id,
    'reward',case when v_reward_id is null then null else jsonb_build_object('id',v_reward_id,'percentOff',v_reward_settings.percent_off,'minOrderIdr',v_reward_settings.min_order_idr,'status','available') end
  );
end;
$$;
revoke execute on function public.submit_order_review(text,jsonb,text) from public, authenticated;
grant execute on function public.submit_order_review(text,jsonb,text) to anon, service_role;

-- Full tracking result now carries payment account snapshot, contact WhatsApp,
-- review template/result, and reward result while retaining the opaque UUID gate.
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
  where o.public_tracking_id=v_tracking_id and o.source='customer_app'
  limit 1;
  return v_result;
end;
$$;
revoke execute on function public.get_order_public_status(text) from public, authenticated;
grant execute on function public.get_order_public_status(text) to anon, service_role;

commit;
