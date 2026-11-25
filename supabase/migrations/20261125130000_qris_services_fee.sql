-- QRIS Services Fee (Q5, Owner decisions 25 Nov 2026).
--
-- The business subsidises a website service & feature maintenance fee per
-- QRIS order. It is never charged to the customer. When a QRIS order is
-- confirmed as paid, one automatic Finance expense "Services Fee" is
-- recorded; it is voided if the order is later cancelled, failed or
-- refunded. The Owner sets the amounts in Settings -> Keuangan -> QRIS
-- (default Rp1.000 below Rp500.000, Rp2.000 from Rp500.000), based on the
-- order total before the unique-code discount. A fee already recorded keeps
-- its amount when the settings change later.

begin;

create table if not exists public.qris_services_fee_settings (
  id text primary key default 'primary' check (id = 'primary'),
  is_enabled boolean not null default true,
  threshold_idr bigint not null default 500000 check (threshold_idr >= 0),
  fee_below_idr bigint not null default 1000 check (fee_below_idr >= 0 and fee_below_idr <= 1000000),
  fee_at_or_above_idr bigint not null default 2000 check (fee_at_or_above_idr >= 0 and fee_at_or_above_idr <= 1000000),
  -- Finance account the fee is paid from; null = the branch QRIS's linked account.
  account_id text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.qris_services_fee_settings enable row level security;
revoke all on public.qris_services_fee_settings from public, anon, authenticated;
insert into public.qris_services_fee_settings(id) values ('primary') on conflict (id) do nothing;

create or replace function private.qris_services_fee_for(p_order_total_idr bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not s.is_enabled then 0
    when greatest(0, coalesce(p_order_total_idr, 0)) >= s.threshold_idr then s.fee_at_or_above_idr
    else s.fee_below_idr
  end
  from public.qris_services_fee_settings s
  where s.id = 'primary'
$$;
revoke execute on function private.qris_services_fee_for(bigint) from public, anon, authenticated;

-- Records (or voids) the order's Services Fee in the Finance ledger.
-- Same mechanics as private.sync_delivery_courier_expense.
create or replace function private.sync_qris_services_fee(p_order_id text, p_actor text, p_void_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_settings public.qris_services_fee_settings%rowtype;
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
  select * into v_settings from public.qris_services_fee_settings where id = 'primary';
  v_reason := coalesce(nullif(trim(coalesce(p_void_reason, '')), ''), 'Services Fee dibatalkan');

  -- Base: order total before the QRIS unique-code discount.
  v_amount := coalesce(private.qris_services_fee_for(v_order.total_idr + coalesce(v_order.qris_unique_discount_idr, 0)), 0);
  v_account := nullif(trim(coalesce(v_settings.account_id, '')), '');
  if v_account is null then
    select nullif(trim(coalesce(q.linked_account_id, '')), '') into v_account
    from public.branch_qris_codes q where q.branch_id = v_order.branch_id;
  end if;

  v_wanted := p_void_reason is null
    and private.is_qris_order(v_order)
    and v_order.payment_status = 'paid'
    and v_order.status not in ('cancelled', 'failed')
    and v_amount > 0;

  select * into v_state from private.operational_domain_state where domain = 'finance' for update;
  if not found then
    return jsonb_build_object('recorded', false, 'reason', 'FINANCE_STATE_NOT_INITIALIZED');
  end if;
  v_transactions := coalesce(v_state.snapshot->'transactions', '[]'::jsonb);

  -- Found by its idempotency key, so the order row is never touched (no revision bump).
  select value into v_tx from jsonb_array_elements(v_transactions)
  where value->>'idempotencyKey' = 'qris-services-fee:' || v_order.id
    and coalesce(value->>'status', '') <> 'void'
  limit 1;

  if v_tx is null and not v_wanted then
    return jsonb_build_object('recorded', false, 'reason', 'NOT_NEEDED');
  end if;
  -- Recorded once; later settings changes do not rewrite it.
  if v_tx is not null and v_wanted then
    return jsonb_build_object('recorded', true, 'reason', 'UNCHANGED', 'transactionId', v_tx->>'id');
  end if;

  if v_tx is null then
    if v_account is null or not private.finance_account_is_valid(v_account) then
      return jsonb_build_object('recorded', false, 'reason', 'SERVICES_FEE_ACCOUNT_REQUIRED');
    end if;
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
      'name', 'Services Fee ' || v_order.order_number,
      'description', 'Biaya layanan & maintenance fitur website (QRIS) untuk pesanan ' || v_order.order_number,
      'orderNumber', v_order.order_number,
      'source', 'qris_services_fee', 'entryMode', 'automatic',
      'transactionDate', clock_timestamp(),
      'idempotencyKey', 'qris-services-fee:' || v_order.id,
      'isSystemGenerated', true, 'actor', coalesce(p_actor, 'System'),
      'createdAt', clock_timestamp(), 'updatedAt', clock_timestamp()
    );
    v_transactions := jsonb_build_array(v_next) || v_transactions;
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
revoke execute on function private.sync_qris_services_fee(text, text, text) from public, anon, authenticated;

-- Record when a QRIS order becomes paid; void when it is cancelled, failed or refunded.
-- Never blocks the order change itself.
create or replace function private.on_order_qris_services_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_void boolean;
begin
  if not private.is_qris_order(new) then
    return null;
  end if;
  v_void := (new.status in ('cancelled', 'failed') and old.status is distinct from new.status)
    or (new.payment_status in ('refund_pending', 'refunded') and old.payment_status is distinct from new.payment_status);
  begin
    if v_void then
      perform private.sync_qris_services_fee(new.id, 'System',
        case when new.status in ('cancelled', 'failed') then 'Pesanan dibatalkan' else 'Pesanan direfund' end);
    elsif new.payment_status = 'paid' and old.payment_status is distinct from 'paid' then
      perform private.sync_qris_services_fee(new.id, 'System', null);
    end if;
  exception when others then
    perform private.write_business_activity('order', new.id, new.branch_id, 'qris_services_fee_failed',
      'Services Fee could not be recorded automatically.', jsonb_build_object('error', sqlerrm));
  end;
  return null;
end;
$$;
revoke execute on function private.on_order_qris_services_fee() from public, anon, authenticated;

drop trigger if exists trg_orders_qris_services_fee on public.orders;
create trigger trg_orders_qris_services_fee
after update of payment_status, status on public.orders
for each row execute function private.on_order_qris_services_fee();

-- ---------------------------------------------------------------------------
-- Settings RPCs (Settings -> Keuangan -> QRIS)
-- ---------------------------------------------------------------------------
create or replace function public.get_qris_services_fee_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.qris_services_fee_settings%rowtype;
begin
  if (select auth.uid()) is null or not private.has_staff_role(array['owner','finance']) then
    raise exception 'QRIS_SETTINGS_NOT_PERMITTED' using errcode = '42501';
  end if;
  select * into v_row from public.qris_services_fee_settings where id = 'primary';
  return jsonb_build_object(
    'isEnabled', v_row.is_enabled,
    'thresholdIdr', v_row.threshold_idr,
    'feeBelowIdr', v_row.fee_below_idr,
    'feeAtOrAboveIdr', v_row.fee_at_or_above_idr,
    'accountId', v_row.account_id,
    'updatedAt', v_row.updated_at
  );
end;
$$;
revoke execute on function public.get_qris_services_fee_settings() from public, anon;
grant execute on function public.get_qris_services_fee_settings() to authenticated;

create or replace function public.save_qris_services_fee_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean := coalesce((p_settings->>'isEnabled')::boolean, true);
  v_threshold bigint := (p_settings->>'thresholdIdr')::bigint;
  v_below bigint := (p_settings->>'feeBelowIdr')::bigint;
  v_above bigint := (p_settings->>'feeAtOrAboveIdr')::bigint;
  v_account text := nullif(trim(coalesce(p_settings->>'accountId', '')), '');
begin
  if (select auth.uid()) is null or private.current_staff_role() is distinct from 'owner' then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if v_threshold is null or v_threshold < 0
     or v_below is null or v_below < 0 or v_below > 1000000
     or v_above is null or v_above < 0 or v_above > 1000000 then
    raise exception 'QRIS_SERVICES_FEE_INVALID' using errcode = '22023';
  end if;
  if v_account is not null and not private.finance_account_is_valid(v_account) then
    raise exception 'QRIS_SERVICES_FEE_ACCOUNT_INVALID' using errcode = '22023';
  end if;

  update public.qris_services_fee_settings set
    is_enabled = v_enabled,
    threshold_idr = v_threshold,
    fee_below_idr = v_below,
    fee_at_or_above_idr = v_above,
    account_id = v_account,
    updated_by = (select auth.uid()),
    updated_at = now()
  where id = 'primary';

  perform private.write_business_activity(
    'finance', 'qris-services-fee', null, 'qris_services_fee_settings_saved',
    'QRIS Services Fee settings saved.',
    jsonb_build_object('isEnabled', v_enabled, 'thresholdIdr', v_threshold, 'feeBelowIdr', v_below, 'feeAtOrAboveIdr', v_above, 'accountId', v_account)
  );
  return public.get_qris_services_fee_settings();
end;
$$;
revoke execute on function public.save_qris_services_fee_settings(jsonb) from public, anon;
grant execute on function public.save_qris_services_fee_settings(jsonb) to authenticated;

commit;
