-- Fleurstales shared Supabase core
-- Phase 2: Catalog + Store Details + Customers/CRM + Orders
-- Canonical app IDs remain TEXT so the existing builds can migrate without ID rewrites.

begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Staff access bridge (Supabase Auth user -> current Fleurstales OS role)
-- This is intentionally small and separate from the HR employee domain.
-- ---------------------------------------------------------------------------
create table if not exists public.staff_access_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  employee_id text,
  display_name text not null,
  role text not null check (role in ('owner', 'admin', 'finance', 'hr', 'florist')),
  branch_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.current_staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select sap.role
  from public.staff_access_profiles sap
  where sap.user_id = (select auth.uid())
    and sap.is_active = true
  limit 1
$$;

create or replace function private.has_staff_role(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_staff_role() = any(p_roles), false)
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.normalize_whatsapp(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  if v_digits = '' then
    return '';
  end if;

  if v_digits like '0%' then
    return '62' || substr(v_digits, 2);
  end if;

  if v_digits like '62%' then
    return v_digits;
  end if;

  return v_digits;
end;
$$;

-- ---------------------------------------------------------------------------
-- Store details shared with Storefront
-- Private OS-only settings (payroll, attendance, permissions, etc.) stay out.
-- ---------------------------------------------------------------------------
create table if not exists public.store_profile (
  id text primary key default 'primary' check (id = 'primary'),
  store_name text not null,
  legal_name text,
  logo_url text,
  phone text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  address text not null default '',
  currency text not null default 'IDR' check (currency = 'IDR'),
  timezone text not null default 'Asia/Jakarta' check (timezone = 'Asia/Jakarta'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.branches (
  id text primary key,
  name text not null,
  code text not null unique,
  address text not null default '',
  phone text not null default '',
  is_active boolean not null default true,
  is_default boolean not null default false,
  delivery_fee_idr bigint not null default 0 check (delivery_fee_idr >= 0),
  opening_hours jsonb not null default '{}'::jsonb,
  latitude double precision,
  longitude double precision,
  -- Private operational values are stored here but are not readable by anon.
  manager_employee_id text,
  daily_order_limit integer check (daily_order_limit is null or daily_order_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_branches_single_default
  on public.branches ((is_default))
  where is_default = true and is_active = true;

create table if not exists public.public_payment_accounts (
  id text primary key,
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  type text not null check (type in ('bank_transfer', 'ewallet')),
  is_active boolean not null default true,
  is_default boolean not null default false,
  display_order integer not null default 0,
  is_customer_visible boolean not null default true,
  branch_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_public_payment_accounts_single_default
  on public.public_payment_accounts ((is_default))
  where is_default = true and is_active = true;

create table if not exists public.storefront_payment_settings (
  id text primary key default 'primary' check (id = 'primary'),
  payment_instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalog
-- Occasion is the customer-facing category. A product can belong to many.
-- Cost is physically separated from the public variant table.
-- ---------------------------------------------------------------------------
create table if not exists public.occasions (
  id text primary key,
  name text not null unique,
  prefix text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  product_code text not null unique,
  primary_occasion_id text references public.occasions(id) on delete restrict,
  material text not null check (material in ('fresh', 'artificial')),
  name text not null,
  description text,
  product_type text,
  collection_series text,
  pricing_type text check (pricing_type is null or pricing_type in ('Fixed', 'Starts From')),
  order_type text check (order_type is null or order_type in ('Catalog', 'Custom')),
  is_featured boolean not null default false,
  is_active boolean not null default true,
  promo_label text,
  original_price_idr bigint check (original_price_idr is null or original_price_idr >= 0),
  is_customizable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_primary_occasion on public.products(primary_occasion_id);
create index if not exists idx_products_active_featured on public.products(is_active, is_featured);
create index if not exists idx_products_product_type on public.products(product_type);

create table if not exists public.product_occasions (
  product_id text not null references public.products(id) on delete cascade,
  occasion_id text not null references public.occasions(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (product_id, occasion_id)
);
create index if not exists idx_product_occasions_occasion on public.product_occasions(occasion_id, product_id);

create table if not exists public.product_variants (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  sku text not null unique,
  size text not null,
  price_idr bigint not null check (price_idr >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_product_variants_product on public.product_variants(product_id, status, sort_order);

create table if not exists public.product_variant_costs (
  variant_id text primary key references public.product_variants(id) on delete cascade,
  cost_idr bigint check (cost_idr is null or cost_idr >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id text primary key default ('img_' || replace(gen_random_uuid()::text, '-', '')),
  product_id text not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_product_images_product on public.product_images(product_id, sort_order);
create unique index if not exists uq_product_images_single_primary
  on public.product_images(product_id)
  where is_primary = true;

-- ---------------------------------------------------------------------------
-- Customers / CRM
-- Storefront never receives direct SELECT privileges on these tables.
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id text primary key,
  name text not null,
  whatsapp_number text not null,
  normalized_whatsapp_number text not null unique,
  email text,
  birthday date,
  preferred_branch_id text references public.branches(id) on delete set null,
  tags text[] not null default '{}'::text[],
  notes text,
  promo_code text,
  created_source text not null default 'admin' check (created_source in ('storefront', 'admin')),
  last_order_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_customers_name on public.customers(name);
create index if not exists idx_customers_last_order on public.customers(last_order_at desc nulls last);

create table if not exists public.customer_addresses (
  id text primary key default ('addr_' || replace(gen_random_uuid()::text, '-', '')),
  customer_id text not null references public.customers(id) on delete cascade,
  label text,
  recipient_name text,
  whatsapp_number text,
  address text not null,
  city text,
  postal_code text,
  delivery_notes text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_customer_addresses_customer on public.customer_addresses(customer_id);

-- ---------------------------------------------------------------------------
-- Orders
-- Order rows preserve historical snapshots; current CRM/catalog data may change.
-- ---------------------------------------------------------------------------
create table if not exists public.order_sequences (
  branch_id text not null references public.branches(id) on delete restrict,
  sequence_year integer not null,
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, sequence_year)
);

create table if not exists public.orders (
  id text primary key,
  order_number text not null unique,
  revision integer not null default 1 check (revision >= 1),
  storefront_idempotency_key text unique,

  customer_id text references public.customers(id) on delete set null,
  customer_name_snapshot text not null,
  customer_whatsapp_snapshot text,
  customer_email_snapshot text,
  customer_profile_suggestions jsonb,

  source text not null check (source in ('whatsapp', 'walk_in', 'customer_app')),
  fulfillment text not null check (fulfillment in ('delivery', 'pickup')),
  status text not null check (status in (
    'pending_verification', 'confirmed', 'processing', 'ready', 'delivering',
    'delivered', 'picked_up', 'cancelled', 'failed'
  )),

  branch_id text not null references public.branches(id) on delete restrict,
  total_idr bigint not null check (total_idr >= 0),
  items_subtotal_idr bigint not null default 0 check (items_subtotal_idr >= 0),
  discount_idr bigint not null default 0 check (discount_idr >= 0),
  delivery_fee_idr bigint not null default 0 check (delivery_fee_idr >= 0),

  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid', 'refund_pending', 'refunded')),
  payment_method text check (payment_method is null or payment_method in ('cash', 'transfer')),
  paid_amount_idr bigint not null default 0 check (paid_amount_idr >= 0),

  refund_amount_idr bigint check (refund_amount_idr is null or refund_amount_idr >= 0),
  refund_reason text,
  refund_initiated_by text,
  refund_initiated_at timestamptz,
  refund_completed_by text,
  refund_completed_at timestamptz,
  refund_cancelled_by text,
  refund_cancelled_at timestamptz,
  refund_cancellation_reason text,

  schedule_label text,
  schedule_date date,
  schedule_time time,
  requested_pickup_date date,
  requested_pickup_time time,
  actual_picked_up_at timestamptz,

  order_note text,
  greeting_message text,
  greeting_card_name text,
  delivery_address text,
  delivery_instructions text,
  promo_code text,

  florist_display_name text,
  florist_assigned_employee_id text,
  florist_assigned_at timestamptz,
  florist_assigned_for_date date,
  florist_assigned_for_time time,
  florist_assigned_by_employee_id text,
  florist_assigned_by_name text,
  florist_schedule_override boolean not null default false,
  florist_schedule_override_reason text,
  florist_scheduled_branch_id text,
  florist_assigned_branch_id text,
  florist_scheduled_shift_start time,
  florist_scheduled_shift_end time,
  processing_started_at timestamptz,
  admin_handled_employee_id text,
  admin_handled_by_name text,

  completed_at timestamptz,
  finance_verified boolean not null default false,
  finance_verified_by text,
  finance_verified_at timestamptz,
  finance_verification_status text check (finance_verification_status is null or finance_verification_status in ('rejected', 'review')),
  finance_verification_note text,
  finance_verification_actor text,
  finance_verification_at timestamptz,
  finance_resubmitted_by text,
  finance_resubmitted_at timestamptz,
  finance_resubmission_note text,
  finance_submission_revision integer,
  pending_change_request jsonb,
  edit_unlocked boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (total_idr = greatest(0, items_subtotal_idr - discount_idr + delivery_fee_idr))
);

create index if not exists idx_orders_branch_status on public.orders(branch_id, status, created_at desc);
create index if not exists idx_orders_customer on public.orders(customer_id, created_at desc);
create index if not exists idx_orders_finance_queue on public.orders(finance_verified, finance_verification_status, created_at desc);
create index if not exists idx_orders_schedule on public.orders(branch_id, schedule_date, schedule_time);

create table if not exists public.order_items (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  variant_id text references public.product_variants(id) on delete set null,
  product_code_snapshot text,
  product_name_snapshot text not null,
  variant_sku_snapshot text,
  variant_size_snapshot text,
  quantity integer not null check (quantity > 0),
  unit_price_idr bigint not null check (unit_price_idr >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_order_items_order on public.order_items(order_id);
create index if not exists idx_order_items_product on public.order_items(product_id);

create table if not exists public.order_payment_events (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  type text not null check (type in (
    'payment_received', 'payment_reversed', 'payment_status_adjusted',
    'refund_initiated', 'refund_completed', 'refund_cancelled'
  )),
  amount_idr bigint not null default 0,
  previous_paid_amount_idr bigint not null default 0,
  resulting_paid_amount_idr bigint not null default 0,
  resulting_status text not null check (resulting_status in ('unpaid', 'partial', 'paid', 'refund_pending', 'refunded')),
  method text check (method is null or method in ('cash', 'transfer')),
  reference text,
  proof_id text,
  note text,
  actor_id text,
  actor_name text not null,
  occurred_at timestamptz not null,
  idempotency_key text not null unique,
  ledger_transaction_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_payment_events_order on public.order_payment_events(order_id, occurred_at desc);

create table if not exists public.order_activities (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('created', 'status', 'payment', 'assignment', 'fulfillment', 'note', 'system')),
  description text not null,
  actor text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_activities_order on public.order_activities(order_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Updated-at / optimistic revision triggers
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'staff_access_profiles', 'store_profile', 'branches', 'public_payment_accounts',
    'storefront_payment_settings', 'occasions', 'products', 'product_variants',
    'product_variant_costs', 'product_images', 'customers', 'customer_addresses'
  ]
  loop
    execute format('drop trigger if exists trg_%I_touch_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%I_touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;

create or replace function private.bump_order_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_orders_bump_revision on public.orders;
create trigger trg_orders_bump_revision
before update on public.orders
for each row execute function private.bump_order_revision();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.staff_access_profiles enable row level security;
alter table public.store_profile enable row level security;
alter table public.branches enable row level security;
alter table public.public_payment_accounts enable row level security;
alter table public.storefront_payment_settings enable row level security;
alter table public.occasions enable row level security;
alter table public.products enable row level security;
alter table public.product_occasions enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_variant_costs enable row level security;
alter table public.product_images enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.order_sequences enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_payment_events enable row level security;
alter table public.order_activities enable row level security;

-- Clear broad default privileges, then grant only the operations needed.
revoke all on table public.staff_access_profiles from anon, authenticated;
revoke all on table public.store_profile from anon, authenticated;
revoke all on table public.branches from anon, authenticated;
revoke all on table public.public_payment_accounts from anon, authenticated;
revoke all on table public.storefront_payment_settings from anon, authenticated;
revoke all on table public.occasions from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.product_occasions from anon, authenticated;
revoke all on table public.product_variants from anon, authenticated;
revoke all on table public.product_variant_costs from anon, authenticated;
revoke all on table public.product_images from anon, authenticated;
revoke all on table public.customers from anon, authenticated;
revoke all on table public.customer_addresses from anon, authenticated;
revoke all on table public.order_sequences from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.order_payment_events from anon, authenticated;
revoke all on table public.order_activities from anon, authenticated;

-- Public Storefront reads.
grant select on public.store_profile to anon, authenticated;
grant select (id, name, code, address, phone, is_active, is_default, delivery_fee_idr, opening_hours, latitude, longitude, created_at, updated_at)
  on public.branches to anon, authenticated;
grant select on public.public_payment_accounts to anon, authenticated;
grant select on public.storefront_payment_settings to anon, authenticated;
grant select on public.occasions to anon, authenticated;
grant select on public.products to anon, authenticated;
grant select on public.product_occasions to anon, authenticated;
grant select on public.product_variants to anon, authenticated;
grant select on public.product_images to anon, authenticated;

-- OS authenticated access. RLS still decides which rows/actions succeed.
grant select, insert, update, delete on public.staff_access_profiles to authenticated;
grant select, insert, update, delete on public.store_profile to authenticated;
grant select, insert, update, delete on public.branches to authenticated;
grant select, insert, update, delete on public.public_payment_accounts to authenticated;
grant select, insert, update, delete on public.storefront_payment_settings to authenticated;
grant select, insert, update, delete on public.occasions to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.product_occasions to authenticated;
grant select, insert, update, delete on public.product_variants to authenticated;
grant select, insert, update, delete on public.product_images to authenticated;
grant select, insert, update, delete on public.product_variant_costs to authenticated;
grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select on public.order_sequences to authenticated;
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, update, delete on public.order_payment_events to authenticated;
grant select, insert, update, delete on public.order_activities to authenticated;

-- Staff access profile: user can read own; Owner manages all mappings.
create policy staff_access_select_own_or_owner on public.staff_access_profiles
for select to authenticated
using (user_id = (select auth.uid()) or private.has_staff_role(array['owner']));

create policy staff_access_owner_insert on public.staff_access_profiles
for insert to authenticated
with check (private.has_staff_role(array['owner']));
create policy staff_access_owner_update on public.staff_access_profiles
for update to authenticated
using (private.has_staff_role(array['owner']))
with check (private.has_staff_role(array['owner']));
create policy staff_access_owner_delete on public.staff_access_profiles
for delete to authenticated
using (private.has_staff_role(array['owner']));

-- Store profile/settings: public read, Owner write.
create policy store_profile_public_read on public.store_profile
for select to anon, authenticated using (true);
create policy store_profile_owner_insert on public.store_profile
for insert to authenticated with check (private.has_staff_role(array['owner']));
create policy store_profile_owner_update on public.store_profile
for update to authenticated using (private.has_staff_role(array['owner'])) with check (private.has_staff_role(array['owner']));
create policy store_profile_owner_delete on public.store_profile
for delete to authenticated using (private.has_staff_role(array['owner']));

create policy branches_public_read_active on public.branches
for select to anon using (is_active = true);
create policy branches_authenticated_read on public.branches
for select to authenticated using (is_active = true or private.has_staff_role(array['owner','admin','finance','hr','florist']));
create policy branches_owner_insert on public.branches
for insert to authenticated with check (private.has_staff_role(array['owner']));
create policy branches_owner_update on public.branches
for update to authenticated using (private.has_staff_role(array['owner'])) with check (private.has_staff_role(array['owner']));
create policy branches_owner_delete on public.branches
for delete to authenticated using (private.has_staff_role(array['owner']));

create policy payment_accounts_public_read on public.public_payment_accounts
for select to anon using (is_active = true and is_customer_visible = true);
create policy payment_accounts_authenticated_read on public.public_payment_accounts
for select to authenticated using (
  (is_active = true and is_customer_visible = true)
  or private.has_staff_role(array['owner','admin','finance'])
);
create policy payment_accounts_owner_insert on public.public_payment_accounts
for insert to authenticated with check (private.has_staff_role(array['owner']));
create policy payment_accounts_owner_update on public.public_payment_accounts
for update to authenticated using (private.has_staff_role(array['owner'])) with check (private.has_staff_role(array['owner']));
create policy payment_accounts_owner_delete on public.public_payment_accounts
for delete to authenticated using (private.has_staff_role(array['owner']));

create policy payment_settings_public_read on public.storefront_payment_settings
for select to anon, authenticated using (true);
create policy payment_settings_owner_insert on public.storefront_payment_settings
for insert to authenticated with check (private.has_staff_role(array['owner']));
create policy payment_settings_owner_update on public.storefront_payment_settings
for update to authenticated using (private.has_staff_role(array['owner'])) with check (private.has_staff_role(array['owner']));
create policy payment_settings_owner_delete on public.storefront_payment_settings
for delete to authenticated using (private.has_staff_role(array['owner']));

-- Catalog: public only active records; Owner/Admin manage catalog.
create policy occasions_public_read on public.occasions
for select to anon using (is_active = true);
create policy occasions_staff_read on public.occasions
for select to authenticated using (is_active = true or private.has_staff_role(array['owner','admin','finance']));
create policy occasions_editor_insert on public.occasions
for insert to authenticated with check (private.has_staff_role(array['owner','admin']));
create policy occasions_editor_update on public.occasions
for update to authenticated using (private.has_staff_role(array['owner','admin'])) with check (private.has_staff_role(array['owner','admin']));
create policy occasions_editor_delete on public.occasions
for delete to authenticated using (private.has_staff_role(array['owner','admin']));

create policy products_public_read on public.products
for select to anon using (is_active = true);
create policy products_staff_read on public.products
for select to authenticated using (is_active = true or private.has_staff_role(array['owner','admin','finance']));
create policy products_editor_insert on public.products
for insert to authenticated with check (private.has_staff_role(array['owner','admin']));
create policy products_editor_update on public.products
for update to authenticated using (private.has_staff_role(array['owner','admin'])) with check (private.has_staff_role(array['owner','admin']));
create policy products_editor_delete on public.products
for delete to authenticated using (private.has_staff_role(array['owner','admin']));

create policy product_occasions_public_read on public.product_occasions
for select to anon using (
  exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
  and exists (select 1 from public.occasions o where o.id = occasion_id and o.is_active = true)
);
create policy product_occasions_staff_read on public.product_occasions
for select to authenticated using (
  exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
  or private.has_staff_role(array['owner','admin','finance'])
);
create policy product_occasions_editor_insert on public.product_occasions
for insert to authenticated with check (private.has_staff_role(array['owner','admin']));
create policy product_occasions_editor_update on public.product_occasions
for update to authenticated using (private.has_staff_role(array['owner','admin'])) with check (private.has_staff_role(array['owner','admin']));
create policy product_occasions_editor_delete on public.product_occasions
for delete to authenticated using (private.has_staff_role(array['owner','admin']));

create policy variants_public_read on public.product_variants
for select to anon using (
  status = 'active' and exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
);
create policy variants_staff_read on public.product_variants
for select to authenticated using (
  (status = 'active' and exists (select 1 from public.products p where p.id = product_id and p.is_active = true))
  or private.has_staff_role(array['owner','admin','finance'])
);
create policy variants_editor_insert on public.product_variants
for insert to authenticated with check (private.has_staff_role(array['owner','admin']));
create policy variants_editor_update on public.product_variants
for update to authenticated using (private.has_staff_role(array['owner','admin'])) with check (private.has_staff_role(array['owner','admin']));
create policy variants_editor_delete on public.product_variants
for delete to authenticated using (private.has_staff_role(array['owner','admin']));

create policy variant_costs_finance_read on public.product_variant_costs
for select to authenticated using (private.has_staff_role(array['owner','finance']));
create policy variant_costs_finance_insert on public.product_variant_costs
for insert to authenticated with check (private.has_staff_role(array['owner','finance']));
create policy variant_costs_finance_update on public.product_variant_costs
for update to authenticated using (private.has_staff_role(array['owner','finance'])) with check (private.has_staff_role(array['owner','finance']));
create policy variant_costs_finance_delete on public.product_variant_costs
for delete to authenticated using (private.has_staff_role(array['owner','finance']));

create policy product_images_public_read on public.product_images
for select to anon using (exists (select 1 from public.products p where p.id = product_id and p.is_active = true));
create policy product_images_staff_read on public.product_images
for select to authenticated using (
  exists (select 1 from public.products p where p.id = product_id and p.is_active = true)
  or private.has_staff_role(array['owner','admin','finance'])
);
create policy product_images_editor_insert on public.product_images
for insert to authenticated with check (private.has_staff_role(array['owner','admin']));
create policy product_images_editor_update on public.product_images
for update to authenticated using (private.has_staff_role(array['owner','admin'])) with check (private.has_staff_role(array['owner','admin']));
create policy product_images_editor_delete on public.product_images
for delete to authenticated using (private.has_staff_role(array['owner','admin']));

-- CRM: Storefront has no direct access. Owner/Admin manage CRM.
create policy customers_crm_read on public.customers
for select to authenticated using (private.has_staff_role(array['owner','admin']));
create policy customers_crm_insert on public.customers
for insert to authenticated with check (private.has_staff_role(array['owner','admin']));
create policy customers_crm_update on public.customers
for update to authenticated using (private.has_staff_role(array['owner','admin'])) with check (private.has_staff_role(array['owner','admin']));
create policy customers_crm_delete on public.customers
for delete to authenticated using (private.has_staff_role(array['owner','admin']));

create policy customer_addresses_crm_read on public.customer_addresses
for select to authenticated using (private.has_staff_role(array['owner','admin']));
create policy customer_addresses_crm_insert on public.customer_addresses
for insert to authenticated with check (private.has_staff_role(array['owner','admin']));
create policy customer_addresses_crm_update on public.customer_addresses
for update to authenticated using (private.has_staff_role(array['owner','admin'])) with check (private.has_staff_role(array['owner','admin']));
create policy customer_addresses_crm_delete on public.customer_addresses
for delete to authenticated using (private.has_staff_role(array['owner','admin']));

-- Orders: no public table access. Public creation is RPC-only below.
create policy orders_staff_read on public.orders
for select to authenticated using (private.has_staff_role(array['owner','admin','finance','hr','florist']));
create policy orders_editor_insert on public.orders
for insert to authenticated with check (private.has_staff_role(array['owner','admin','finance']));
create policy orders_editor_update on public.orders
for update to authenticated using (private.has_staff_role(array['owner','admin','finance'])) with check (private.has_staff_role(array['owner','admin','finance']));
create policy orders_editor_delete on public.orders
for delete to authenticated using (private.has_staff_role(array['owner','admin','finance']));

create policy order_items_staff_read on public.order_items
for select to authenticated using (private.has_staff_role(array['owner','admin','finance','hr','florist']));
create policy order_items_editor_insert on public.order_items
for insert to authenticated with check (private.has_staff_role(array['owner','admin','finance']));
create policy order_items_editor_update on public.order_items
for update to authenticated using (private.has_staff_role(array['owner','admin','finance'])) with check (private.has_staff_role(array['owner','admin','finance']));
create policy order_items_editor_delete on public.order_items
for delete to authenticated using (private.has_staff_role(array['owner','admin','finance']));

create policy order_payments_staff_read on public.order_payment_events
for select to authenticated using (private.has_staff_role(array['owner','admin','finance']));
create policy order_payments_editor_insert on public.order_payment_events
for insert to authenticated with check (private.has_staff_role(array['owner','admin','finance']));
create policy order_payments_editor_update on public.order_payment_events
for update to authenticated using (private.has_staff_role(array['owner','finance'])) with check (private.has_staff_role(array['owner','finance']));
create policy order_payments_editor_delete on public.order_payment_events
for delete to authenticated using (private.has_staff_role(array['owner','finance']));

create policy order_activities_staff_read on public.order_activities
for select to authenticated using (private.has_staff_role(array['owner','admin','finance','hr','florist']));
create policy order_activities_editor_insert on public.order_activities
for insert to authenticated with check (private.has_staff_role(array['owner','admin','finance']));
create policy order_activities_editor_update on public.order_activities
for update to authenticated using (private.has_staff_role(array['owner','admin','finance'])) with check (private.has_staff_role(array['owner','admin','finance']));
create policy order_activities_editor_delete on public.order_activities
for delete to authenticated using (private.has_staff_role(array['owner','admin','finance']));

create policy order_sequences_staff_read on public.order_sequences
for select to authenticated using (private.has_staff_role(array['owner','admin','finance']));

-- ---------------------------------------------------------------------------
-- Public transactional checkout RPC
-- - CRM matching uses normalized WhatsApp.
-- - Existing CRM name is preserved.
-- - Email/birthday/preferred branch only fill empty CRM values.
-- - Price and delivery fee are always read from database, never trusted from client.
-- - Order number allocation is atomic per branch/year.
-- ---------------------------------------------------------------------------
create or replace function public.create_storefront_order(
  p_idempotency_key text,
  p_customer jsonb,
  p_branch_id text,
  p_fulfillment text,
  p_schedule_date date,
  p_schedule_time time,
  p_items jsonb,
  p_delivery_address text default null,
  p_delivery_instructions text default null,
  p_order_note text default null,
  p_greeting_message text default null,
  p_greeting_card_name text default null,
  p_payment_method text default 'transfer'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_customer public.customers%rowtype;
  v_normalized_whatsapp text;
  v_customer_name text;
  v_customer_email text;
  v_customer_birthday date;
  v_customer_id text;
  v_order_id text;
  v_order_number text;
  v_sequence bigint;
  v_year integer;
  v_items_subtotal bigint := 0;
  v_delivery_fee bigint := 0;
  v_total bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_quantity integer;
  v_item_count integer;
  v_day_key text;
  v_day_hours jsonb;
  v_existing_order public.orders%rowtype;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 16 or length(trim(p_idempotency_key)) > 128 then
    raise exception 'A valid checkout idempotency key is required.' using errcode = '22023';
  end if;

  select * into v_existing_order
  from public.orders
  where storefront_idempotency_key = trim(p_idempotency_key)
  limit 1;

  if found then
    return jsonb_build_object(
      'orderId', v_existing_order.id,
      'orderNumber', v_existing_order.order_number,
      'customerId', v_existing_order.customer_id,
      'itemsSubtotalIdr', v_existing_order.items_subtotal_idr,
      'deliveryFeeIdr', v_existing_order.delivery_fee_idr,
      'discountIdr', v_existing_order.discount_idr,
      'totalIdr', v_existing_order.total_idr,
      'deduplicated', true
    );
  end if;

  v_customer_name := nullif(trim(coalesce(p_customer->>'name', '')), '');
  v_normalized_whatsapp := private.normalize_whatsapp(p_customer->>'whatsappNumber');
  v_customer_email := nullif(lower(trim(coalesce(p_customer->>'email', ''))), '');

  if v_customer_name is null then
    raise exception 'Customer name is required.' using errcode = '22023';
  end if;
  if length(v_normalized_whatsapp) < 8 then
    raise exception 'A valid WhatsApp number is required.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_customer->>'birthday', '')), '') is not null then
    v_customer_birthday := (p_customer->>'birthday')::date;
  end if;

  if p_fulfillment not in ('delivery', 'pickup') then
    raise exception 'Invalid fulfillment type.' using errcode = '22023';
  end if;
  if p_payment_method not in ('transfer', 'cash') then
    raise exception 'Invalid payment method.' using errcode = '22023';
  end if;
  if p_fulfillment = 'delivery' and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
    raise exception 'Delivery address is required.' using errcode = '22023';
  end if;
  if p_fulfillment = 'delivery' and p_payment_method = 'cash' then
    raise exception 'Cash payment is only available for pickup orders.' using errcode = '22023';
  end if;

  select * into v_branch
  from public.branches
  where id = p_branch_id and is_active = true
  for share;

  if not found then
    raise exception 'Selected branch is unavailable.' using errcode = '22023';
  end if;

  if p_schedule_date is null or p_schedule_time is null then
    raise exception 'Schedule date and time are required.' using errcode = '22023';
  end if;
  if p_schedule_date < timezone('Asia/Jakarta', now())::date then
    raise exception 'Schedule date cannot be in the past.' using errcode = '22023';
  end if;
  if p_payment_method = 'transfer' and not exists (
    select 1
    from public.public_payment_accounts account
    where account.is_active = true
      and account.is_customer_visible = true
      and (cardinality(account.branch_ids) = 0 or p_branch_id = any(account.branch_ids))
  ) then
    raise exception 'Bank transfer is unavailable for this branch.' using errcode = '22023';
  end if;

  v_day_key := lower(trim(to_char(p_schedule_date, 'FMDay')));
  v_day_hours := v_branch.opening_hours -> v_day_key;
  if v_day_hours is null
     or coalesce((v_day_hours->>'isOpen')::boolean, false) = false then
    raise exception 'Selected branch is closed on this date.' using errcode = '22023';
  end if;
  if p_schedule_time < (v_day_hours->>'opensAt')::time
     or p_schedule_time > (v_day_hours->>'closesAt')::time then
    raise exception 'Selected time is outside branch opening hours.' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Order items must be an array.' using errcode = '22023';
  end if;
  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 20 then
    raise exception 'Order must contain between 1 and 20 items.' using errcode = '22023';
  end if;

  -- Atomic CRM upsert by normalized WhatsApp. The conflict branch deliberately
  -- does not overwrite the established CRM name or existing non-empty profile data.
  insert into public.customers (
    id, name, whatsapp_number, normalized_whatsapp_number, email, birthday,
    preferred_branch_id, created_source, last_order_at
  ) values (
    'cust_' || replace(gen_random_uuid()::text, '-', ''),
    v_customer_name,
    coalesce(nullif(trim(p_customer->>'whatsappNumber'), ''), v_normalized_whatsapp),
    v_normalized_whatsapp,
    v_customer_email,
    v_customer_birthday,
    p_branch_id,
    'storefront',
    now()
  )
  on conflict (normalized_whatsapp_number) do update
  set
    email = case
      when nullif(trim(coalesce(public.customers.email, '')), '') is null then excluded.email
      else public.customers.email
    end,
    birthday = coalesce(public.customers.birthday, excluded.birthday),
    preferred_branch_id = coalesce(public.customers.preferred_branch_id, excluded.preferred_branch_id),
    last_order_at = now()
  returning * into v_customer;

  v_customer_id := v_customer.id;

  -- Validate every line and derive subtotal exclusively from active catalog rows.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 99 then
      raise exception 'Item quantity must be between 1 and 99.' using errcode = '22023';
    end if;

    select * into v_product
    from public.products
    where id = nullif(v_item->>'productId', '') and is_active = true;
    if not found then
      raise exception 'A selected product is unavailable.' using errcode = '22023';
    end if;

    select * into v_variant
    from public.product_variants
    where id = nullif(v_item->>'variantId', '')
      and product_id = v_product.id
      and status = 'active';
    if not found then
      raise exception 'A selected product variant is unavailable.' using errcode = '22023';
    end if;

    v_items_subtotal := v_items_subtotal + (v_variant.price_idr * v_quantity);
  end loop;

  v_delivery_fee := case when p_fulfillment = 'delivery' then v_branch.delivery_fee_idr else 0 end;
  v_total := v_items_subtotal + v_delivery_fee;

  v_year := extract(year from timezone('Asia/Jakarta', now()))::integer;
  insert into public.order_sequences(branch_id, sequence_year, last_sequence, updated_at)
  values (v_branch.id, v_year, 1, now())
  on conflict (branch_id, sequence_year)
  do update set last_sequence = public.order_sequences.last_sequence + 1, updated_at = now()
  returning last_sequence into v_sequence;

  v_order_number := upper(v_branch.code) || '-' || v_year::text || '-' || lpad(v_sequence::text, 4, '0');
  v_order_id := 'order_' || replace(gen_random_uuid()::text, '-', '');

  insert into public.orders (
    id, order_number, revision, storefront_idempotency_key,
    customer_id, customer_name_snapshot, customer_whatsapp_snapshot, customer_email_snapshot,
    customer_profile_suggestions,
    source, fulfillment, status, branch_id,
    total_idr, items_subtotal_idr, discount_idr, delivery_fee_idr,
    payment_status, payment_method, paid_amount_idr,
    schedule_label, schedule_date, schedule_time,
    requested_pickup_date, requested_pickup_time,
    order_note, greeting_message, greeting_card_name,
    delivery_address, delivery_instructions,
    created_at, updated_at
  ) values (
    v_order_id, v_order_number, 1, trim(p_idempotency_key),
    v_customer_id,
    coalesce(v_customer.name, v_customer_name),
    coalesce(v_customer.whatsapp_number, p_customer->>'whatsappNumber'),
    coalesce(v_customer.email, v_customer_email),
    jsonb_strip_nulls(jsonb_build_object(
      'birthday', v_customer_birthday,
      'email', v_customer_email,
      'preferredBranchId', p_branch_id
    )),
    'customer_app', p_fulfillment, 'pending_verification', v_branch.id,
    v_total, v_items_subtotal, 0, v_delivery_fee,
    'unpaid', p_payment_method, 0,
    to_char(p_schedule_date, 'YYYY-MM-DD') || ' · ' || to_char(p_schedule_time, 'HH24:MI'),
    p_schedule_date, p_schedule_time,
    case when p_fulfillment = 'pickup' then p_schedule_date else null end,
    case when p_fulfillment = 'pickup' then p_schedule_time else null end,
    nullif(trim(coalesce(p_order_note, '')), ''),
    nullif(trim(coalesce(p_greeting_message, '')), ''),
    nullif(trim(coalesce(p_greeting_card_name, '')), ''),
    case when p_fulfillment = 'delivery' then nullif(trim(coalesce(p_delivery_address, '')), '') else null end,
    case when p_fulfillment = 'delivery' then nullif(trim(coalesce(p_delivery_instructions, '')), '') else null end,
    now(), now()
  );

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = v_item->>'productId';
    select * into v_variant from public.product_variants where id = v_item->>'variantId';

    insert into public.order_items (
      id, order_id, product_id, variant_id,
      product_code_snapshot, product_name_snapshot,
      variant_sku_snapshot, variant_size_snapshot,
      quantity, unit_price_idr
    ) values (
      'line_' || replace(gen_random_uuid()::text, '-', ''),
      v_order_id,
      v_product.id,
      v_variant.id,
      v_product.product_code,
      v_product.name,
      v_variant.sku,
      v_variant.size,
      v_quantity,
      v_variant.price_idr
    );
  end loop;

  insert into public.order_activities(id, order_id, kind, description, actor, occurred_at)
  values (
    'activity_' || replace(gen_random_uuid()::text, '-', ''),
    v_order_id,
    'created',
    'Order created from Online Store',
    'Storefront customer',
    now()
  );

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'customerId', v_customer_id,
    'itemsSubtotalIdr', v_items_subtotal,
    'deliveryFeeIdr', v_delivery_fee,
    'discountIdr', 0,
    'totalIdr', v_total,
    'deduplicated', false
  );
exception
  when unique_violation then
    -- Handles a race where the same idempotency key arrives twice.
    select * into v_existing_order
    from public.orders
    where storefront_idempotency_key = trim(p_idempotency_key)
    limit 1;
    if found then
      return jsonb_build_object(
        'orderId', v_existing_order.id,
        'orderNumber', v_existing_order.order_number,
        'customerId', v_existing_order.customer_id,
        'itemsSubtotalIdr', v_existing_order.items_subtotal_idr,
        'deliveryFeeIdr', v_existing_order.delivery_fee_idr,
        'discountIdr', v_existing_order.discount_idr,
        'totalIdr', v_existing_order.total_idr,
        'deduplicated', true
      );
    end if;
    raise;
end;
$$;

revoke execute on function public.create_storefront_order(text, jsonb, text, text, date, time, jsonb, text, text, text, text, text, text) from public;
grant execute on function public.create_storefront_order(text, jsonb, text, text, date, time, jsonb, text, text, text, text, text, text) to anon, authenticated;

-- Private helper functions are needed by authenticated RLS policies but are not
-- in an exposed PostgREST schema.
grant usage on schema private to authenticated;
grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.has_staff_role(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets + write policies
-- Product assets are public-read CDN assets; only Owner/Admin may mutate.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 102400, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-assets', 'store-assets', true, 1048576, array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'product-images' and private.has_staff_role(array['owner','admin']));
create policy product_images_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'product-images' and private.has_staff_role(array['owner','admin']))
with check (bucket_id = 'product-images' and private.has_staff_role(array['owner','admin']));
create policy product_images_storage_delete on storage.objects
for delete to authenticated
using (bucket_id = 'product-images' and private.has_staff_role(array['owner','admin']));

create policy store_assets_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'store-assets' and private.has_staff_role(array['owner']));
create policy store_assets_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'store-assets' and private.has_staff_role(array['owner']))
with check (bucket_id = 'store-assets' and private.has_staff_role(array['owner']));
create policy store_assets_storage_delete on storage.objects
for delete to authenticated
using (bucket_id = 'store-assets' and private.has_staff_role(array['owner']));

-- ---------------------------------------------------------------------------
-- Realtime publication
-- Orders/CRM for OS live updates; catalog/store for future live Storefront refresh.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'store_profile','branches','public_payment_accounts','storefront_payment_settings',
    'occasions','products','product_occasions','product_variants','product_images',
    'customers','orders','order_items','order_payment_events','order_activities'
  ]
  loop
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

commit;
