-- Order confirmation / tracking authority smoke tests.

do $$
declare
  v_definition text;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='public_tracking_id'
  ) then
    raise exception 'orders.public_tracking_id is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='finance_reference_code'
  ) then
    raise exception 'orders.finance_reference_code is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='cancellation_reason'
  ) then
    raise exception 'orders cancellation metadata is missing';
  end if;

  if has_table_privilege('anon','public.orders','SELECT') then
    raise exception 'Anonymous clients must not receive direct orders access';
  end if;

  if not has_function_privilege('anon','public.get_order_public_status(text)','EXECUTE')
     or has_function_privilege('authenticated','public.get_order_public_status(text)','EXECUTE') then
    raise exception 'Full public tracking RPC grants are incorrect';
  end if;
  if not has_function_privilege('anon','public.search_order_public_status(text)','EXECUTE')
     or has_function_privilege('authenticated','public.search_order_public_status(text)','EXECUTE') then
    raise exception 'Coarse public tracking RPC grants are incorrect';
  end if;

  if has_function_privilege('anon','public.save_order_finance_reference(text,integer,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.save_order_finance_reference(text,integer,text)','EXECUTE') then
    raise exception 'Finance reference RPC grants are incorrect';
  end if;
  if has_function_privilege('anon','public.confirm_pending_storefront_order(text,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.confirm_pending_storefront_order(text,integer)','EXECUTE') then
    raise exception 'Storefront confirm RPC grants are incorrect';
  end if;
  if has_function_privilege('anon','public.cancel_pending_storefront_order(text,integer,text)','EXECUTE')
     or not has_function_privilege('authenticated','public.cancel_pending_storefront_order(text,integer,text)','EXECUTE') then
    raise exception 'Storefront cancel RPC grants are incorrect';
  end if;

  select pg_get_functiondef('public.get_order_public_status(text)'::regprocedure)
  into v_definition;
  if position('consume_public_order_lookup_budget' in v_definition)=0
     or position('public_tracking_id' in v_definition)=0
     or position('finance_reference_code' in v_definition)>0 then
    raise exception 'Full tracking RPC lost limiter/token lookup or leaks finance reference';
  end if;

  select pg_get_functiondef('public.search_order_public_status(text)'::regprocedure)
  into v_definition;
  if position('consume_public_order_lookup_budget' in v_definition)=0
     or position('customer_name_snapshot' in v_definition)>0
     or position('delivery_address' in v_definition)>0
     or position('payment_status' in v_definition)>0 then
    raise exception 'Order-number lookup is not coarse/private enough';
  end if;

  select pg_get_functiondef('private.order_idempotency_result(public.orders,boolean)'::regprocedure)
  into v_definition;
  if position('publicTrackingId' in v_definition)=0 then
    raise exception 'Storefront checkout result does not expose public tracking id';
  end if;
end $$;
