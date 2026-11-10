-- M3: "Flower of the Month" — a small, hand-picked monthly highlight for the
-- storefront, separate from products.is_featured (which most products carry).
-- Catalog editors (Owner, Admin, Manager) choose up to 6 products per month.

begin;

create table if not exists public.catalog_monthly_highlights (
  highlight_month date primary key check (extract(day from highlight_month) = 1),
  product_ids text[] not null check (cardinality(product_ids) between 1 and 6),
  note text check (note is null or char_length(note) <= 160),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.catalog_monthly_highlights enable row level security;
revoke all on public.catalog_monthly_highlights from public, anon, authenticated;

-- Storefront: this month's picks, active products only, in the chosen order.
create or replace function public.get_flower_of_the_month()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'month', to_char(h.highlight_month, 'YYYY-MM'),
    'note', h.note,
    'productIds', coalesce((
      select jsonb_agg(p.id order by picked.position)
      from unnest(h.product_ids) with ordinality as picked(product_id, position)
      join public.products p on p.id = picked.product_id and p.is_active = true
    ), '[]'::jsonb)
  )
  from public.catalog_monthly_highlights h
  where h.highlight_month = date_trunc('month', now() at time zone 'Asia/Jakarta')::date
$function$;

revoke execute on function public.get_flower_of_the_month() from public;
grant execute on function public.get_flower_of_the_month() to anon, authenticated, service_role;

-- OS: this month and next month for the editor.
create or replace function public.get_catalog_monthly_highlights()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_current date := date_trunc('month', now() at time zone 'Asia/Jakarta')::date;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not private.has_section_access('catalog', 'view') then
    raise exception 'CATALOG_VIEW_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return (
    select jsonb_agg(jsonb_build_object(
      'month', to_char(m.month_start, 'YYYY-MM'),
      'note', h.note,
      'productIds', coalesce(to_jsonb(h.product_ids), '[]'::jsonb)
    ) order by m.month_start)
    from (values (v_current), ((v_current + interval '1 month')::date)) as m(month_start)
    left join public.catalog_monthly_highlights h on h.highlight_month = m.month_start
  );
end;
$function$;

revoke execute on function public.get_catalog_monthly_highlights() from public, anon;
grant execute on function public.get_catalog_monthly_highlights() to authenticated;

create or replace function public.save_catalog_monthly_highlight(p_month text, p_product_ids text[], p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current date := date_trunc('month', now() at time zone 'Asia/Jakarta')::date;
  v_month date;
  v_ids text[];
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not private.has_section_access('catalog', 'edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'HIGHLIGHT_MONTH_INVALID' using errcode = '22023';
  end if;
  v_month := to_date(p_month || '-01', 'YYYY-MM-DD');
  if v_month < v_current or v_month > (v_current + interval '1 month')::date then
    raise exception 'HIGHLIGHT_MONTH_OUT_OF_RANGE' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 160 then
    raise exception 'HIGHLIGHT_NOTE_TOO_LONG' using errcode = '22023';
  end if;

  -- Keep the chosen order, drop duplicates and blanks.
  select coalesce(array_agg(product_id order by first_position), '{}'::text[])
  into v_ids
  from (
    select picked.product_id, min(picked.position) as first_position
    from unnest(coalesce(p_product_ids, '{}'::text[])) with ordinality as picked(product_id, position)
    where btrim(coalesce(picked.product_id, '')) <> ''
    group by picked.product_id
  ) chosen;

  if cardinality(v_ids) > 6 then
    raise exception 'HIGHLIGHT_TOO_MANY_PRODUCTS' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) as chosen(product_id)
    where not exists (select 1 from public.products p where p.id = chosen.product_id and p.is_active = true)
  ) then
    raise exception 'HIGHLIGHT_PRODUCT_NOT_ACTIVE' using errcode = '22023';
  end if;

  if cardinality(v_ids) = 0 then
    delete from public.catalog_monthly_highlights where highlight_month = v_month;
  else
    insert into public.catalog_monthly_highlights(highlight_month, product_ids, note, updated_by, updated_at)
    values (v_month, v_ids, v_note, (select auth.uid()), now())
    on conflict (highlight_month) do update
      set product_ids = excluded.product_ids, note = excluded.note,
          updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;

  return jsonb_build_object('month', p_month, 'note', case when cardinality(v_ids) = 0 then null else v_note end, 'productIds', to_jsonb(v_ids));
end;
$function$;

revoke execute on function public.save_catalog_monthly_highlight(text, text[], text) from public, anon;
grant execute on function public.save_catalog_monthly_highlight(text, text[], text) to authenticated;

commit;
