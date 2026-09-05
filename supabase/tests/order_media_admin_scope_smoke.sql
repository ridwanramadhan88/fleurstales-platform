do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'can_write_order_media_object'
  limit 1;

  if v_definition is null then
    raise exception 'can_write_order_media_object is missing';
  end if;

  if position('current_staff_branch_id' in v_definition) > 0 then
    raise exception 'order media writes are still incorrectly branch-scoped';
  end if;

  if position('can_read_order_row' in v_definition) = 0 then
    raise exception 'order media writes must reuse the order read authorization boundary';
  end if;

  if position('orders.advance_status' in v_definition) = 0 then
    raise exception 'order media writes must require orders.advance_status';
  end if;
end
$$;
