begin;

create table if not exists public.arrangement_types (
  name text primary key,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint arrangement_types_name_check check (char_length(trim(name)) between 1 and 80)
);

insert into public.arrangement_types(name, sort_order)
select product_type, row_number() over (order by product_type) - 1
from (
  select distinct trim(product_type) as product_type
  from public.products
  where nullif(trim(product_type), '') is not null
) types
on conflict (name) do nothing;

alter table public.arrangement_types enable row level security;
drop policy if exists arrangement_types_public_read on public.arrangement_types;
create policy arrangement_types_public_read
on public.arrangement_types for select
to anon, authenticated
using (true);

revoke insert, update, delete on public.arrangement_types from anon, authenticated;
grant select on public.arrangement_types to anon, authenticated;

create or replace function public.replace_arrangement_types(p_names jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_names text[];
begin
  if not private.has_section_access('catalog', 'edit') then
    raise exception 'CATALOG_EDIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_names) <> 'array' then
    raise exception 'Arrangement types must be a JSON array.' using errcode = '22023';
  end if;

  select coalesce(array_agg(name order by ordinal), array[]::text[])
  into v_names
  from (
    select trim(value) as name, min(ordinality) as ordinal
    from jsonb_array_elements_text(p_names) with ordinality
    where nullif(trim(value), '') is not null
    group by trim(value)
  ) normalized;

  if exists (select 1 from unnest(v_names) name where char_length(name) > 80) then
    raise exception 'Arrangement type names must be 80 characters or fewer.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.products product
    where nullif(trim(product.product_type), '') is not null
      and not (trim(product.product_type) = any(v_names))
  ) then
    raise exception 'An arrangement type used by a product cannot be removed.' using errcode = '23503';
  end if;

  delete from public.arrangement_types type
  where not (type.name = any(v_names));

  for v_name in select name from unnest(v_names) with ordinality item(name, ordinal) order by ordinal
  loop
    insert into public.arrangement_types(name, sort_order)
    values(v_name, array_position(v_names, v_name) - 1)
    on conflict(name) do update set sort_order = excluded.sort_order;
  end loop;

  return jsonb_build_object('count', cardinality(v_names));
end;
$$;

revoke all on function public.replace_arrangement_types(jsonb) from public, anon;
grant execute on function public.replace_arrangement_types(jsonb) to authenticated;

commit;
