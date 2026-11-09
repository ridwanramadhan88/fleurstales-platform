-- D3: "Kirim" step. The Owner/Admin records how an order is sent (Gojek or an
-- internal courier), the real cost and the Gojek tracking link. The real Gojek
-- cost is booked as a Finance expense from one fixed payment account per
-- branch and corrected / voided together with the order.
begin;

alter table public.branches
  add column if not exists courier_payment_account_id text;

-- The storefront reads the branch list with the anon key (column-level grants).
grant select (courier_payment_account_id) on public.branches to anon;

alter table public.orders
  add column if not exists delivery_provider text,
  add column if not exists delivery_courier_name text,
  add column if not exists delivery_actual_cost_idr bigint,
  add column if not exists delivery_tracking_url text,
  add column if not exists delivery_shipped_at timestamptz,
  add column if not exists delivery_cost_txn_id text;

alter table public.orders drop constraint if exists orders_delivery_provider_check;
alter table public.orders add constraint orders_delivery_provider_check
  check (delivery_provider is null or delivery_provider in ('gojek', 'internal'));
alter table public.orders drop constraint if exists orders_delivery_actual_cost_check;
alter table public.orders add constraint orders_delivery_actual_cost_check
  check (delivery_actual_cost_idr is null or delivery_actual_cost_idr >= 0);
alter table public.orders drop constraint if exists orders_delivery_tracking_url_check;
alter table public.orders add constraint orders_delivery_tracking_url_check
  check (delivery_tracking_url is null or (char_length(delivery_tracking_url) <= 500 and delivery_tracking_url ~* '^https://'));

-- Books, corrects or voids the Finance expense that mirrors the real Gojek
-- cost of one order. Returns {recorded, reason}. The Finance ledger is a JSON
-- snapshot guarded by `revision`, so this locks and bumps it like any writer.
create or replace function private.sync_delivery_courier_expense(
  p_order_id text,
  p_actor text,
  p_void_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_branch public.branches%rowtype;
  v_state private.operational_domain_state%rowtype;
  v_transactions jsonb;
  v_tx jsonb;
  v_next jsonb;
  v_id text;
  v_account text;
  v_amount bigint;
  v_month date;
  v_wanted boolean;
  v_reason text;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('recorded', false, 'reason', 'ORDER_NOT_FOUND'); end if;
  select * into v_branch from public.branches where id = v_order.branch_id;
  v_account := nullif(trim(coalesce(v_branch.courier_payment_account_id, '')), '');
  v_amount := coalesce(v_order.delivery_actual_cost_idr, 0);
  v_reason := coalesce(nullif(trim(coalesce(p_void_reason, '')), ''), 'Ongkos kurir berubah');

  v_wanted := p_void_reason is null
    and v_order.delivery_provider = 'gojek'
    and v_amount > 0
    and v_order.status not in ('cancelled', 'failed');

  select * into v_state from private.operational_domain_state where domain = 'finance' for update;
  if not found then
    return jsonb_build_object('recorded', false, 'reason', 'FINANCE_STATE_NOT_INITIALIZED');
  end if;
  v_transactions := coalesce(v_state.snapshot->'transactions', '[]'::jsonb);

  if v_order.delivery_cost_txn_id is not null then
    select value into v_tx from jsonb_array_elements(v_transactions)
    where value->>'id' = v_order.delivery_cost_txn_id limit 1;
  end if;

  if v_tx is not null and v_tx->>'status' = 'void' then v_tx := null; end if;

  if v_tx is null and not v_wanted then
    return jsonb_build_object('recorded', false, 'reason', case when v_order.delivery_provider = 'gojek' and v_amount > 0 then 'NOT_NEEDED' else 'NO_COST' end);
  end if;

  if v_wanted and (v_account is null or not private.finance_account_is_valid(v_account)) then
    if v_tx is null then
      return jsonb_build_object('recorded', false, 'reason', 'COURIER_PAYMENT_ACCOUNT_REQUIRED');
    end if;
    -- An old expense exists but the account is gone: keep it as it is.
    return jsonb_build_object('recorded', true, 'reason', 'ACCOUNT_UNCHANGED', 'transactionId', v_tx->>'id');
  end if;

  if v_tx is null then
    v_month := private.finance_period_month_from_text(clock_timestamp()::text);
    if v_month is not null and private.finance_period_is_closed(v_month) then
      raise exception 'FINANCE_PERIOD_CLOSED month=%', v_month using errcode = '55000';
    end if;
    v_id := 'txn_' || replace(gen_random_uuid()::text, '-', '');
    v_next := jsonb_build_object(
      'id', v_id, 'type', 'expense', 'category', 'other',
      'branch', v_order.branch_id, 'scope', 'branch',
      'accountId', v_account, 'amount', v_amount,
      'method', case when v_account = 'cash:main' then 'cash' else 'transfer' end,
      'status', 'verified',
      'name', 'Ongkos kurir Gojek ' || v_order.order_number,
      'description', 'Ongkos kirim asli Gojek untuk pesanan ' || v_order.order_number,
      'orderNumber', v_order.order_number,
      'source', 'delivery_courier', 'entryMode', 'automatic',
      'transactionDate', clock_timestamp(),
      'idempotencyKey', 'delivery-courier:' || v_order.id,
      'isSystemGenerated', true, 'actor', coalesce(p_actor, 'System'),
      'createdAt', clock_timestamp(), 'updatedAt', clock_timestamp()
    );
    v_transactions := jsonb_build_array(v_next) || v_transactions;
    update public.orders set delivery_cost_txn_id = v_id where id = v_order.id;
  elsif v_wanted then
    if (v_tx->>'amount')::bigint = v_amount and v_tx->>'accountId' = v_account then
      return jsonb_build_object('recorded', true, 'reason', 'UNCHANGED', 'transactionId', v_tx->>'id');
    end if;
    v_month := private.finance_transaction_period_month(v_tx);
    if v_month is not null and private.finance_period_is_closed(v_month) then
      raise exception 'FINANCE_PERIOD_CLOSED month=%', v_month using errcode = '55000';
    end if;
    v_id := v_tx->>'id';
    select coalesce(jsonb_agg(case when x->>'id' = v_id then
      x || jsonb_build_object(
        'amount', v_amount, 'accountId', v_account,
        'method', case when v_account = 'cash:main' then 'cash' else 'transfer' end,
        'revision', coalesce((x->>'revision')::integer, 1) + 1,
        'editHistory', coalesce(x->'editHistory', '[]'::jsonb) || jsonb_build_array(private.finance_tx_edit_record(x, coalesce(p_actor, 'System'), v_reason, 'edit')),
        'updatedAt', clock_timestamp(), 'updatedBy', coalesce(p_actor, 'System'))
      else x end), '[]'::jsonb)
    into v_transactions from jsonb_array_elements(v_transactions) x;
  else
    v_month := private.finance_transaction_period_month(v_tx);
    if v_month is not null and private.finance_period_is_closed(v_month) then
      raise exception 'FINANCE_PERIOD_CLOSED month=%', v_month using errcode = '55000';
    end if;
    v_id := v_tx->>'id';
    select coalesce(jsonb_agg(case when x->>'id' = v_id then
      x || jsonb_build_object(
        'status', 'void', 'voidedAt', clock_timestamp(), 'voidedBy', coalesce(p_actor, 'System'), 'voidReason', v_reason,
        'revision', coalesce((x->>'revision')::integer, 1) + 1,
        'editHistory', coalesce(x->'editHistory', '[]'::jsonb) || jsonb_build_array(private.finance_tx_edit_record(x, coalesce(p_actor, 'System'), v_reason, 'void')),
        'updatedAt', clock_timestamp(), 'updatedBy', coalesce(p_actor, 'System'))
      else x end), '[]'::jsonb)
    into v_transactions from jsonb_array_elements(v_transactions) x;
  end if;

  update private.operational_domain_state
  set revision = revision + 1,
      snapshot = jsonb_set(snapshot, '{transactions}', v_transactions, true),
      updated_by = (select auth.uid()), updated_at = now()
  where domain = 'finance';

  return jsonb_build_object('recorded', v_wanted, 'reason', case when v_wanted then 'RECORDED' else 'VOIDED' end, 'transactionId', v_id);
end;
$$;
revoke all on function private.sync_delivery_courier_expense(text, text, text) from public, anon, authenticated;
grant execute on function private.sync_delivery_courier_expense(text, text, text) to service_role;

-- Owner/Admin record how the order is sent. Callable while the order is ready
-- to send or on the way.
create or replace function public.save_order_shipment(
  p_order_id text,
  p_expected_revision integer,
  p_shipment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_before public.orders%rowtype;
  v_actor text;
  v_provider text := lower(trim(coalesce(p_shipment->>'provider', '')));
  v_courier text := nullif(trim(coalesce(p_shipment->>'courierName', '')), '');
  v_url text := nullif(trim(coalesce(p_shipment->>'trackingUrl', '')), '');
  v_cost bigint;
  v_finance jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if private.current_staff_role() is null or private.current_staff_role() not in ('owner', 'admin') then
    raise exception 'ORDER_SHIPMENT_PERMISSION_REQUIRED' using errcode = '42501';
  end if;
  if v_provider not in ('gojek', 'internal') then
    raise exception 'DELIVERY_PROVIDER_INVALID' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%', p_expected_revision, v_order.revision using errcode = '40001';
  end if;
  if v_order.fulfillment <> 'delivery' then raise exception 'ORDER_NOT_DELIVERY' using errcode = '22023'; end if;
  if v_order.status not in ('ready', 'delivering') then
    raise exception 'ORDER_SHIPMENT_LOCKED' using errcode = '22023';
  end if;

  if v_provider = 'gojek' then
    begin
      v_cost := nullif(trim(coalesce(p_shipment->>'actualCostIdr', '')), '')::bigint;
    exception when others then
      raise exception 'DELIVERY_COST_INVALID' using errcode = '22023';
    end;
    if v_cost is null or v_cost < 0 or v_cost > 100000000 then
      raise exception 'DELIVERY_COST_INVALID' using errcode = '22023';
    end if;
    if v_url is not null and (char_length(v_url) > 500 or v_url !~* '^https://') then
      raise exception 'DELIVERY_TRACKING_URL_INVALID' using errcode = '22023';
    end if;
    v_courier := null;
  else
    if v_courier is not null and char_length(v_courier) > 120 then
      raise exception 'DELIVERY_COURIER_NAME_TOO_LONG' using errcode = '22023';
    end if;
    v_cost := null;
    v_url := null;
  end if;

  v_before := v_order;
  select coalesce(nullif(trim(sap.display_name), ''), sap.role) into v_actor
  from public.staff_access_profiles sap
  where sap.user_id = (select auth.uid()) and sap.is_active = true limit 1;

  update public.orders set
    delivery_provider = v_provider,
    delivery_courier_name = v_courier,
    delivery_actual_cost_idr = v_cost,
    delivery_tracking_url = v_url,
    delivery_shipped_at = coalesce(delivery_shipped_at, now())
  where id = v_order.id;

  v_finance := private.sync_delivery_courier_expense(v_order.id, v_actor);

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at, metadata)
  values (
    'activity_' || replace(gen_random_uuid()::text, '-', ''), v_order.id, 'fulfillment',
    case when v_provider = 'gojek'
      then 'Pengiriman Gojek dicatat, ongkos asli ' || private.format_idr(v_cost) || '.'
      else 'Pengiriman kurir internal dicatat' || coalesce(' (' || v_courier || ')', '') || '.' end,
    v_actor, now(),
    jsonb_build_object(
      'before', jsonb_build_object('provider', v_before.delivery_provider, 'courierName', v_before.delivery_courier_name,
        'actualCostIdr', v_before.delivery_actual_cost_idr, 'trackingUrl', v_before.delivery_tracking_url),
      'after', jsonb_build_object('provider', v_provider, 'courierName', v_courier,
        'actualCostIdr', v_cost, 'trackingUrl', v_url),
      'finance', v_finance
    )
  );

  select * into v_order from public.orders where id = v_order.id;
  return jsonb_build_object(
    'orderId', v_order.id, 'revision', v_order.revision,
    'deliveryProvider', v_order.delivery_provider,
    'deliveryCourierName', v_order.delivery_courier_name,
    'deliveryActualCostIdr', v_order.delivery_actual_cost_idr,
    'deliveryTrackingUrl', v_order.delivery_tracking_url,
    'financeRecorded', coalesce((v_finance->>'recorded')::boolean, false),
    'financeReason', v_finance->>'reason'
  );
end;
$$;

create or replace function public.save_order_shipment_guarded(
  p_order_id text,
  p_expected_revision integer,
  p_shipment jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.save_order_shipment(p_order_id, p_expected_revision, p_shipment);
exception when serialization_failure then
  raise exception using errcode = 'PT409', message = sqlerrm,
    hint = 'Reload the order before saving the shipment again.';
end;
$$;

revoke all on function public.save_order_shipment(text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_order_shipment(text, integer, jsonb) to service_role;
revoke all on function public.save_order_shipment_guarded(text, integer, jsonb) from public, anon;
grant execute on function public.save_order_shipment_guarded(text, integer, jsonb) to authenticated, service_role;

-- Cancelling the order voids its courier expense. Finance problems (closed
-- period, ledger not set up) never block the cancellation itself.
create or replace function private.void_courier_expense_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'failed') and old.status is distinct from new.status
     and new.delivery_cost_txn_id is not null then
    begin
      perform private.sync_delivery_courier_expense(new.id, 'System', 'Pesanan dibatalkan');
    exception when others then
      perform private.write_business_activity('order', new.id, new.branch_id, 'courier_expense_void_failed',
        'Courier expense could not be voided automatically.', jsonb_build_object('error', sqlerrm));
    end;
  end if;
  return null;
end;
$$;
revoke all on function private.void_courier_expense_on_cancel() from public, anon, authenticated;

drop trigger if exists trg_orders_void_courier_expense on public.orders;
create trigger trg_orders_void_courier_expense
  after update of status on public.orders
  for each row execute function private.void_courier_expense_on_cancel();

-- Settings snapshot: courier payment account per branch.
CREATE OR REPLACE FUNCTION public.replace_public_store_snapshot(p_base_revision bigint, p_profile jsonb, p_branches jsonb, p_payment_accounts jsonb, p_payment_instructions text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_revision bigint;
  v_next_revision bigint;
  v_branch jsonb;
  v_account jsonb;
  v_branch_count integer;
  v_account_count integer;
  v_active_branch_count integer;
  v_active_account_count integer;
  v_default_account_count integer;
  v_duplicate_count integer;
  v_default_branch_count integer;
begin
  if not (
    private.has_action_permission('settings.edit_store_profile')
    and private.has_action_permission('settings.edit_branches')
    and private.has_action_permission('settings.edit_payment_methods')
  ) then
    raise exception 'STORE_SETTINGS_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_profile) <> 'object' then
    raise exception 'p_profile must be a JSON object.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_branches) <> 'array' then
    raise exception 'p_branches must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payment_accounts) <> 'array' then
    raise exception 'p_payment_accounts must be a JSON array.' using errcode = '22023';
  end if;
  if coalesce(nullif(trim(p_profile->>'storeName'), ''), '') = '' then
    raise exception 'Store name is required.' using errcode = '22023';
  end if;
  if coalesce(nullif(trim(p_payment_instructions), ''), '') = '' then
    raise exception 'Payment instructions are required.' using errcode = '22023';
  end if;

  select count(*) into v_active_branch_count
  from jsonb_array_elements(p_branches) branch
  where coalesce((branch->>'isActive')::boolean, true) = true;
  if v_active_branch_count = 0 then
    raise exception 'At least one active branch is required.' using errcode = '22023';
  end if;

  select count(*) - count(distinct branch->>'id') into v_duplicate_count
  from jsonb_array_elements(p_branches) branch;
  if v_duplicate_count > 0 then
    raise exception 'Branch ids must be unique.' using errcode = '22023';
  end if;

  select count(*) - count(distinct upper(trim(branch->>'code'))) into v_duplicate_count
  from jsonb_array_elements(p_branches) branch;
  if v_duplicate_count > 0 then
    raise exception 'Branch codes must be unique.' using errcode = '22023';
  end if;

  select count(*) into v_default_branch_count
  from jsonb_array_elements(p_branches) branch
  where coalesce((branch->>'isActive')::boolean, true) = true
    and coalesce((branch->>'isDefault')::boolean, false) = true;
  if v_default_branch_count > 1 then
    raise exception 'At most one active branch may be the default.' using errcode = '22023';
  end if;

  select count(*) into v_active_account_count
  from jsonb_array_elements(p_payment_accounts) account
  where coalesce((account->>'isActive')::boolean, true) = true;
  if v_active_account_count = 0 then
    raise exception 'At least one active payment account is required.' using errcode = '22023';
  end if;

  select count(*) into v_default_account_count
  from jsonb_array_elements(p_payment_accounts) account
  where coalesce((account->>'isActive')::boolean, true) = true
    and coalesce((account->>'isDefault')::boolean, false) = true;
  if v_default_account_count <> 1 then
    raise exception 'Exactly one active payment account must be the default.' using errcode = '22023';
  end if;


  select count(*) - count(distinct account->>'id') into v_duplicate_count
  from jsonb_array_elements(p_payment_accounts) account;
  if v_duplicate_count > 0 then
    raise exception 'Payment account ids must be unique.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_payment_accounts) account
    cross join lateral jsonb_array_elements_text(coalesce(account->'branchIds', '[]'::jsonb)) branch_id
    where not exists (
      select 1 from jsonb_array_elements(p_branches) branch
      where branch->>'id' = branch_id
    )
  ) then
    raise exception 'Payment account references an unknown branch.' using errcode = '22023';
  end if;

  insert into public.store_sync_state (id, revision)
  values ('primary', 0)
  on conflict (id) do nothing;

  select revision into v_current_revision
  from public.store_sync_state
  where id = 'primary'
  for update;

  if p_base_revision is null or p_base_revision <> v_current_revision then
    raise exception 'STORE_CONFLICT: expected revision %, current revision %.', p_base_revision, v_current_revision
      using errcode = '40001';
  end if;

  insert into public.store_profile (
    id, store_name, legal_name, logo_url, phone, whatsapp, email, address, currency, timezone
  ) values (
    'primary',
    trim(p_profile->>'storeName'),
    nullif(trim(p_profile->>'legalName'), ''),
    nullif(trim(p_profile->>'logoUrl'), ''),
    coalesce(trim(p_profile->>'phone'), ''),
    coalesce(trim(p_profile->>'whatsapp'), ''),
    coalesce(trim(p_profile->>'email'), ''),
    coalesce(trim(p_profile->>'address'), ''),
    'IDR',
    'Asia/Jakarta'
  )
  on conflict (id) do update set
    store_name = excluded.store_name,
    legal_name = excluded.legal_name,
    logo_url = excluded.logo_url,
    phone = excluded.phone,
    whatsapp = excluded.whatsapp,
    email = excluded.email,
    address = excluded.address,
    currency = excluded.currency,
    timezone = excluded.timezone,
    updated_at = now();

  -- Clear defaults before upserting to avoid transient unique-index conflicts.
  update public.branches set is_default = false where is_default = true;

  for v_branch in select value from jsonb_array_elements(p_branches)
  loop
    if coalesce(nullif(trim(v_branch->>'id'), ''), '') = '' then
      raise exception 'Branch id is required.' using errcode = '22023';
    end if;
    if coalesce(nullif(trim(v_branch->>'code'), ''), '') = '' then
      raise exception 'Branch code is required.' using errcode = '22023';
    end if;
    if coalesce((v_branch->>'deliveryFeeIdr')::bigint, 0) < 0 then
      raise exception 'Branch delivery fee cannot be negative.' using errcode = '22023';
    end if;

    insert into public.branches (
      id, name, code, address, phone, is_active, is_default, sort_order,
      delivery_fee_idr, opening_hours, latitude, longitude
    ) values (
      trim(v_branch->>'id'),
      trim(v_branch->>'name'),
      upper(trim(v_branch->>'code')),
      coalesce(trim(v_branch->>'address'), ''),
      coalesce(trim(v_branch->>'phone'), ''),
      coalesce((v_branch->>'isActive')::boolean, true),
      coalesce((v_branch->>'isDefault')::boolean, false),
      coalesce((v_branch->>'sortOrder')::integer, 0),
      coalesce((v_branch->>'deliveryFeeIdr')::bigint, 0),
      coalesce(v_branch->'openingHours', '{}'::jsonb),
      case when v_branch ? 'latitude' and v_branch->>'latitude' is not null then (v_branch->>'latitude')::double precision else null end,
      case when v_branch ? 'longitude' and v_branch->>'longitude' is not null then (v_branch->>'longitude')::double precision else null end
    )
    on conflict (id) do update set
      name = excluded.name,
      code = excluded.code,
      address = excluded.address,
      phone = excluded.phone,
      is_active = excluded.is_active,
      is_default = excluded.is_default,
      sort_order = excluded.sort_order,
      delivery_fee_idr = excluded.delivery_fee_idr,
      opening_hours = excluded.opening_hours,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = now();

    -- Distance tariff (D2). Only written when the client sends it, so an
    -- older client saving settings never wipes the Owner's tariff.
    if jsonb_typeof(v_branch->'deliveryTariff') = 'object' then
      update public.branches set
        delivery_tariff_enabled = coalesce((v_branch#>>'{deliveryTariff,enabled}')::boolean, false),
        motor_base_idr = coalesce((v_branch#>>'{deliveryTariff,motor,baseIdr}')::bigint, 0),
        motor_included_km = coalesce((v_branch#>>'{deliveryTariff,motor,includedKm}')::numeric, 3),
        motor_per_km_idr = coalesce((v_branch#>>'{deliveryTariff,motor,perKmIdr}')::bigint, 0),
        car_base_idr = coalesce((v_branch#>>'{deliveryTariff,car,baseIdr}')::bigint, 0),
        car_included_km = coalesce((v_branch#>>'{deliveryTariff,car,includedKm}')::numeric, 3),
        car_per_km_idr = coalesce((v_branch#>>'{deliveryTariff,car,perKmIdr}')::bigint, 0),
        max_delivery_km = coalesce((v_branch#>>'{deliveryTariff,maxKm}')::numeric, 25),
        motor_max_items = nullif(v_branch#>>'{deliveryTariff,motorMaxItems}', '')::integer,
        updated_at = now()
      where id = trim(v_branch->>'id');
    end if;

    -- Courier payment account (D3): the Finance account Gojek costs are paid
    -- from. Only written when the client sends the key.
    if v_branch ? 'courierPaymentAccountId' then
      update public.branches set
        courier_payment_account_id = nullif(trim(coalesce(v_branch->>'courierPaymentAccountId', '')), ''),
        updated_at = now()
      where id = trim(v_branch->>'id');
    end if;
  end loop;

  -- Branch rows may be referenced by historical Orders/HR data. Never delete
  -- omitted rows from a full snapshot; retire them instead.
  update public.branches branch
  set is_active = false,
      is_default = false,
      updated_at = now()
  where not exists (
    select 1 from jsonb_array_elements(p_branches) item
    where item->>'id' = branch.id
  );

  update public.public_payment_accounts set is_default = false where is_default = true;

  for v_account in select value from jsonb_array_elements(p_payment_accounts)
  loop
    if coalesce(nullif(trim(v_account->>'id'), ''), '') = '' then
      raise exception 'Payment account id is required.' using errcode = '22023';
    end if;

    insert into public.public_payment_accounts (
      id, bank_name, account_number, account_holder, type,
      is_active, is_default, display_order, is_customer_visible, branch_ids
    ) values (
      trim(v_account->>'id'),
      trim(v_account->>'bankName'),
      trim(v_account->>'accountNumber'),
      trim(v_account->>'accountHolder'),
      coalesce(nullif(v_account->>'type', ''), 'bank_transfer'),
      coalesce((v_account->>'isActive')::boolean, true),
      coalesce((v_account->>'isDefault')::boolean, false),
      coalesce((v_account->>'displayOrder')::integer, 0),
      coalesce((v_account->>'isCustomerVisible')::boolean, true),
      coalesce(array(select jsonb_array_elements_text(coalesce(v_account->'branchIds', '[]'::jsonb))), '{}'::text[])
    )
    on conflict (id) do update set
      bank_name = excluded.bank_name,
      account_number = excluded.account_number,
      account_holder = excluded.account_holder,
      type = excluded.type,
      is_active = excluded.is_active,
      is_default = excluded.is_default,
      display_order = excluded.display_order,
      is_customer_visible = excluded.is_customer_visible,
      branch_ids = excluded.branch_ids,
      updated_at = now();
  end loop;

  delete from public.public_payment_accounts account
  where not exists (
    select 1 from jsonb_array_elements(p_payment_accounts) item
    where item->>'id' = account.id
  );

  insert into public.storefront_payment_settings (id, payment_instructions)
  values ('primary', trim(p_payment_instructions))
  on conflict (id) do update set
    payment_instructions = excluded.payment_instructions,
    updated_at = now();

  v_next_revision := v_current_revision + 1;
  update public.store_sync_state
  set revision = v_next_revision,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = 'primary';

  select jsonb_array_length(p_branches) into v_branch_count;
  select jsonb_array_length(p_payment_accounts) into v_account_count;

  return jsonb_build_object(
    'revision', v_next_revision,
    'branchCount', v_branch_count,
    'paymentAccountCount', v_account_count
  );
end;
$function$;

-- Customer tracking page: Gojek link while the order is on the way.
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
notify pgrst, 'reload schema';

commit;
