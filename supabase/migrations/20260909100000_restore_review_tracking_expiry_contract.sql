begin;

-- Keep the legacy 3-argument review entrypoint explicitly expiry-aware.
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
  v_exists boolean;
begin
  begin
    v_tracking_id := p_tracking_id::uuid;
  exception when invalid_text_representation then
    raise exception 'TRACKING_LINK_INVALID' using errcode='22023';
  end;

  select exists(
    select 1
    from public.orders
    where public_tracking_id = v_tracking_id
      and (tracking_expires_at is null or tracking_expires_at > now())
  ) into v_exists;

  if not v_exists then
    raise exception 'ORDER_NOT_FOUND' using errcode='P0002';
  end if;

  return public.submit_order_review(p_tracking_id, p_answers, p_note, '{}'::jsonb);
end;
$$;

revoke execute on function public.submit_order_review(text,jsonb,text) from public, authenticated;
grant execute on function public.submit_order_review(text,jsonb,text) to anon, service_role;

commit;
