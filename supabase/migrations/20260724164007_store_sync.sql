-- Fleurstales shared Store details synchronization
-- Phase 6: one transactional public Store snapshot shared by Business OS and Storefront.

begin;

alter table public.branches add column if not exists sort_order integer not null default 0;
create index if not exists idx_branches_sort_order on public.branches(sort_order, name);

create table if not exists public.store_sync_state (
  id text primary key default 'primary' check (id = 'primary'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.store_sync_state (id, revision)
values ('primary', 0)
on conflict (id) do nothing;

alter table public.store_sync_state enable row level security;
revoke all on table public.store_sync_state from anon, authenticated;
grant select on table public.store_sync_state to authenticated;

create policy store_sync_state_owner_read on public.store_sync_state
for select to authenticated
using (private.has_staff_role(array['owner']));

create or replace function public.get_store_admin_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if not private.has_staff_role(array['owner']) then
    raise exception 'Owner Store settings access is required.' using errcode = '42501';
  end if;

  select revision, updated_at
    into v_revision, v_updated_at
  from public.store_sync_state
  where id = 'primary';

  return jsonb_build_object(
    'revision', coalesce(v_revision, 0),
    'updatedAt', v_updated_at
  );
end;
$$;

create or replace function public.replace_public_store_snapshot(
  p_base_revision bigint,
  p_profile jsonb,
  p_branches jsonb,
  p_payment_accounts jsonb,
  p_payment_instructions text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if not private.has_staff_role(array['owner']) then
    raise exception 'Owner Store settings access is required.' using errcode = '42501';
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
$$;

revoke all on function public.get_store_admin_state() from public;
revoke all on function public.replace_public_store_snapshot(bigint, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.get_store_admin_state() to authenticated;
grant execute on function public.replace_public_store_snapshot(bigint, jsonb, jsonb, jsonb, text) to authenticated;

commit;
