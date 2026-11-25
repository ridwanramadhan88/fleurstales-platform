-- QRIS static source per branch (Owner decision 25 Nov 2026).
--
-- The branch's static QRIS is never shown to customers or used for payment.
-- It is only the source for amount-embedded (dynamic) QRIS per order, built
-- on the server. So:
--   * the static payload lives in a private table no API role can read;
--   * branch_qris_codes keeps the public-safe parts (merchant name, NMID,
--     linked bank account, on/off) and no longer needs an image;
--   * QRIS cannot be switched on until the amount-embedded QR ships
--     (private.qris_dynamic_ready(), flipped by that release).

begin;

-- ---------------------------------------------------------------------------
-- QRIS payload helpers (EMVCo TLV + CRC16-CCITT, init 0xFFFF, poly 0x1021)
-- ---------------------------------------------------------------------------

create or replace function private.qris_crc16(p_text text)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_bytes bytea := convert_to(p_text, 'UTF8');
  v_crc integer := 65535;
  v_i integer;
  v_bit integer;
begin
  for v_i in 0 .. length(v_bytes) - 1 loop
    v_crc := v_crc # (get_byte(v_bytes, v_i) << 8);
    for v_bit in 1 .. 8 loop
      if (v_crc & 32768) <> 0 then
        v_crc := ((v_crc << 1) # 4129) & 65535;
      else
        v_crc := (v_crc << 1) & 65535;
      end if;
    end loop;
  end loop;
  return upper(lpad(to_hex(v_crc), 4, '0'));
end;
$$;

-- Splits a TLV string into ordered (tag, value) rows. Raises QRIS_INVALID
-- when the structure is broken.
create or replace function private.qris_tlv(p_payload text)
returns table(pos integer, tag text, value text)
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_i integer := 1;
  v_n integer := 0;
  v_len integer;
  v_total integer := length(p_payload);
begin
  while v_i <= v_total loop
    if v_i + 3 > v_total or substr(p_payload, v_i, 4) !~ '^[0-9]{4}$' then
      raise exception 'QRIS_INVALID' using errcode = '22023';
    end if;
    v_len := substr(p_payload, v_i + 2, 2)::integer;
    if v_i + 3 + v_len > v_total then
      raise exception 'QRIS_INVALID' using errcode = '22023';
    end if;
    v_n := v_n + 1;
    pos := v_n;
    tag := substr(p_payload, v_i, 2);
    value := substr(p_payload, v_i + 4, v_len);
    return next;
    v_i := v_i + 4 + v_len;
  end loop;
end;
$$;

-- Validates a static QRIS payload and returns its public-safe details.
create or replace function private.parse_static_qris(p_payload text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_payload text := trim(coalesce(p_payload, ''));
  v_tags jsonb;
  v_merchant_info text;
  v_nmid text;
  v_criteria text;
  v_acquirer text;
  v_sub record;
  v_template record;
begin
  if v_payload = '' or length(v_payload) > 512 or v_payload !~ '^[ -~]+$' then
    raise exception 'QRIS_INVALID' using errcode = '22023';
  end if;
  if right(v_payload, 8) !~ '^6304[0-9A-Fa-f]{4}$'
     or private.qris_crc16(left(v_payload, length(v_payload) - 4)) <> upper(right(v_payload, 4)) then
    raise exception 'QRIS_INVALID' using errcode = '22023';
  end if;

  select jsonb_object_agg(t.tag, t.value) into v_tags from private.qris_tlv(v_payload) t;

  if v_tags->>'00' is distinct from '01'
     or v_tags->>'53' is distinct from '360'
     or v_tags->>'58' is distinct from 'ID'
     or coalesce(v_tags->>'59', '') = '' then
    raise exception 'QRIS_INVALID' using errcode = '22023';
  end if;
  if v_tags->>'01' is distinct from '11' or v_tags ? '54' then
    raise exception 'QRIS_NOT_STATIC' using errcode = '22023';
  end if;

  v_merchant_info := v_tags->>'51';
  if v_merchant_info is not null then
    for v_sub in select s.tag, s.value from private.qris_tlv(v_merchant_info) s loop
      if v_sub.tag = '02' then v_nmid := v_sub.value; end if;
      if v_sub.tag = '03' then v_criteria := v_sub.value; end if;
    end loop;
  end if;
  if coalesce(v_nmid, '') !~ '^ID[0-9A-Z]{8,}$' then
    raise exception 'QRIS_INVALID' using errcode = '22023';
  end if;

  -- Acquirer: first merchant account template (tags 26-45) global id.
  for v_template in
    select t.value from private.qris_tlv(v_payload) t
    where t.tag between '26' and '45' order by t.pos limit 1
  loop
    select s.value into v_acquirer from private.qris_tlv(v_template.value) s where s.tag = '00';
  end loop;

  return jsonb_build_object(
    'merchantName', trim(v_tags->>'59'),
    'merchantCity', trim(coalesce(v_tags->>'60', '')),
    'nmid', v_nmid,
    'merchantCriteria', v_criteria,
    'mcc', v_tags->>'52',
    'acquirer', v_acquirer
  );
end;
$$;

-- Static payload + amount -> dynamic payload (tag 01 = 12, tag 54 after 53,
-- no tip tags 55-57, fresh CRC). Used by the amount-embedded QR release.
create or replace function private.qris_dynamic_payload(p_static_payload text, p_amount_idr bigint)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_row record;
  v_body text := '';
  v_amount text := p_amount_idr::text;
begin
  if p_amount_idr < 1 or p_amount_idr > 9999999999 then
    raise exception 'QRIS_AMOUNT_INVALID' using errcode = '22023';
  end if;
  perform private.parse_static_qris(p_static_payload);
  for v_row in select t.tag, t.value from private.qris_tlv(p_static_payload) t order by t.pos loop
    continue when v_row.tag in ('54', '55', '56', '57', '63');
    if v_row.tag = '01' then
      v_body := v_body || '010212';
    else
      v_body := v_body || v_row.tag || lpad(length(v_row.value)::text, 2, '0') || v_row.value;
    end if;
    if v_row.tag = '53' then
      v_body := v_body || '54' || lpad(length(v_amount)::text, 2, '0') || v_amount;
    end if;
  end loop;
  v_body := v_body || '6304';
  return v_body || private.qris_crc16(v_body);
end;
$$;

-- Flipped to true by the release that ships the amount-embedded QR.
create or replace function private.qris_dynamic_ready()
returns boolean
language sql
immutable
set search_path = ''
as $$ select false $$;

revoke execute on function private.qris_crc16(text) from public, anon, authenticated;
revoke execute on function private.qris_tlv(text) from public, anon, authenticated;
revoke execute on function private.parse_static_qris(text) from public, anon, authenticated;
revoke execute on function private.qris_dynamic_payload(text, bigint) from public, anon, authenticated;
revoke execute on function private.qris_dynamic_ready() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: static payload private, public-safe details on branch_qris_codes
-- ---------------------------------------------------------------------------

create table if not exists private.branch_qris_sources (
  branch_id text primary key references public.branches(id) on update cascade on delete cascade,
  payload text not null,
  nmid text not null unique,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table private.branch_qris_sources enable row level security;
revoke all on private.branch_qris_sources from public, anon, authenticated;

alter table public.branch_qris_codes alter column image_path drop not null;
alter table public.branch_qris_codes drop constraint if exists branch_qris_codes_image_path_check;
alter table public.branch_qris_codes
  add constraint branch_qris_codes_image_path_check check (image_path is null or image_path ~ '^qris/[A-Za-z0-9._-]+$');
alter table public.branch_qris_codes
  add column if not exists merchant_name text,
  add column if not exists nmid text,
  add column if not exists merchant_criteria text,
  add column if not exists mcc text,
  add column if not exists acquirer text;

-- Checkout snapshot: QRIS is offered only with a valid source and once the
-- amount-embedded QR has shipped. Never exposes the static image.
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
    'qrisImagePath', null
  )
  from public.branch_qris_codes q
  join private.branch_qris_sources s on s.branch_id = q.branch_id
  join public.public_payment_accounts a on a.id = q.linked_account_id
  join public.branches b on b.id = q.branch_id
  where q.branch_id = p_branch_id
    and q.is_active = true
    and private.qris_dynamic_ready()
    and b.is_active = true
    and a.is_active = true
    and a.type = 'bank_transfer'
$$;
revoke execute on function private.storefront_qris_account(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Owner RPCs
-- ---------------------------------------------------------------------------

-- Saves (or replaces) a branch's static QRIS source from the decoded QR text.
create or replace function public.save_branch_qris_source(
  p_branch_id text,
  p_payload text,
  p_linked_account_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_info jsonb;
  v_payload text := trim(coalesce(p_payload, ''));
  v_row public.branch_qris_codes%rowtype;
begin
  if (select auth.uid()) is null or private.current_staff_role() is distinct from 'owner' then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.public_payment_accounts
    where id = p_linked_account_id and type = 'bank_transfer' and is_active = true
  ) then
    raise exception 'QRIS_LINKED_ACCOUNT_INVALID' using errcode = '22023';
  end if;

  v_info := private.parse_static_qris(v_payload);

  if exists (
    select 1 from private.branch_qris_sources
    where nmid = v_info->>'nmid' and branch_id <> p_branch_id
  ) then
    raise exception 'QRIS_NMID_IN_USE' using errcode = '23505';
  end if;

  insert into private.branch_qris_sources(branch_id, payload, nmid, updated_by, updated_at)
  values (p_branch_id, v_payload, v_info->>'nmid', (select auth.uid()), now())
  on conflict (branch_id) do update set
    payload = excluded.payload, nmid = excluded.nmid,
    updated_by = excluded.updated_by, updated_at = now();

  insert into public.branch_qris_codes(
    branch_id, image_path, linked_account_id, is_active, updated_by, updated_at,
    merchant_name, nmid, merchant_criteria, mcc, acquirer
  )
  values (
    p_branch_id, null, p_linked_account_id, false, (select auth.uid()), now(),
    v_info->>'merchantName', v_info->>'nmid', v_info->>'merchantCriteria', v_info->>'mcc', v_info->>'acquirer'
  )
  on conflict (branch_id) do update set
    linked_account_id = excluded.linked_account_id,
    is_active = public.branch_qris_codes.is_active and private.qris_dynamic_ready(),
    updated_by = excluded.updated_by,
    updated_at = now(),
    merchant_name = excluded.merchant_name,
    nmid = excluded.nmid,
    merchant_criteria = excluded.merchant_criteria,
    mcc = excluded.mcc,
    acquirer = excluded.acquirer
  returning * into v_row;

  perform private.write_business_activity(
    'finance', p_branch_id, p_branch_id, 'branch_qris_source_saved',
    'Branch QRIS source saved.',
    jsonb_build_object('nmid', v_row.nmid, 'linkedAccountId', v_row.linked_account_id)
  );

  return jsonb_build_object(
    'branchId', v_row.branch_id,
    'imagePath', v_row.image_path,
    'linkedAccountId', v_row.linked_account_id,
    'isActive', v_row.is_active,
    'merchantName', v_row.merchant_name,
    'nmid', v_row.nmid,
    'merchantCriteria', v_row.merchant_criteria,
    'mcc', v_row.mcc,
    'acquirer', v_row.acquirer
  );
end;
$$;
revoke execute on function public.save_branch_qris_source(text, text, text) from public, anon;
grant execute on function public.save_branch_qris_source(text, text, text) to authenticated;

-- Linked account + on/off. p_image_path is kept for signature compatibility
-- and ignored: QRIS images are no longer stored.
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
  if not exists (select 1 from private.branch_qris_sources where branch_id = p_branch_id) then
    raise exception 'QRIS_SOURCE_REQUIRED' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.public_payment_accounts
    where id = p_linked_account_id and type = 'bank_transfer' and is_active = true
  ) then
    raise exception 'QRIS_LINKED_ACCOUNT_INVALID' using errcode = '22023';
  end if;
  if coalesce(p_is_active, false) and not private.qris_dynamic_ready() then
    raise exception 'QRIS_DYNAMIC_NOT_READY' using errcode = '22023';
  end if;

  update public.branch_qris_codes set
    linked_account_id = p_linked_account_id,
    is_active = coalesce(p_is_active, false),
    updated_by = (select auth.uid()),
    updated_at = now()
  where branch_id = p_branch_id
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

-- Forgets a legacy static image after the Owner's browser deleted the file.
create or replace function public.clear_branch_qris_image(p_branch_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or private.current_staff_role() is distinct from 'owner' then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  update public.branch_qris_codes set image_path = null, updated_at = now()
  where branch_id = p_branch_id and image_path is not null;
end;
$$;
revoke execute on function public.clear_branch_qris_image(text) from public, anon;
grant execute on function public.clear_branch_qris_image(text) to authenticated;

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
  delete from private.branch_qris_sources where branch_id = p_branch_id;
  delete from public.branch_qris_codes where branch_id = p_branch_id;
  perform private.write_business_activity('finance', p_branch_id, p_branch_id, 'branch_qris_removed', 'Branch QRIS removed.', '{}'::jsonb);
end;
$$;
revoke execute on function public.delete_branch_qris(text) from public, anon;
grant execute on function public.delete_branch_qris(text) to authenticated;

-- Existing rows have no source yet: keep them off until the Owner's source is saved.
update public.branch_qris_codes q set is_active = false
where not exists (select 1 from private.branch_qris_sources s where s.branch_id = q.branch_id);

commit;
