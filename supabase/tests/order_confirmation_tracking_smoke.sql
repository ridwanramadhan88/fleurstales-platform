-- Order confirmation, reconciliation reference, and privacy-safe tracking contract.

do $$
declare
  v_source text;
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='public_tracking_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='finance_reference_code')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='orders' and column_name='cancellation_reason') then
    raise exception 'Order tracking/reconciliation columns are incomplete';
  end if;

  if has_table_privilege('anon','public.orders','SELECT') then
    raise exception 'anon must not have direct orders table SELECT';
  end if;
  if has_table_privilege('anon','private.order_lookup_attempts','SELECT')
     or has_table_privilege('authenticated','private.order_lookup_attempts','SELECT') then
    raise exception 'Public lookup limiter table is browser-readable';
  end if;

  if not has_function_privilege('anon','public.get_order_public_status(text)','EXECUTE')
     or has_function_privilege('authenticated','public.get_order_public_status(text)','EXECUTE') then
    raise exception 'Full public tracking RPC grants are incorrect';
  end if;
  if not has_function_privilege('anon','public.search_order_public_status(text)','EXECUTE')
     or has_function_privilege('authenticated','public.search_order_public_status(text)','EXECUTE') then
    raise exception 'Coarse tracking RPC grants are incorrect';
  end if;
  if has_function_privilege('anon','private.consume_public_order_lookup_budget()','EXECUTE')
     or has_function_privilege('authenticated','private.consume_public_order_lookup_budget()','EXECUTE') then
    raise exception 'Rate limiter helper is browser-executable';
  end if;

  if not has_function_privilege('authenticated','public.save_order_finance_reference(text,integer,text)','EXECUTE')
     or has_function_privilege('anon','public.save_order_finance_reference(text,integer,text)','EXECUTE') then
    raise exception 'Finance reference RPC grants are incorrect';
  end if;
  if not has_function_privilege('authenticated','public.confirm_pending_storefront_order(text,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.cancel_pending_storefront_order(text,integer,text)','EXECUTE')
     or has_function_privilege('anon','public.confirm_pending_storefront_order(text,integer)','EXECUTE')
     or has_function_privilege('anon','public.cancel_pending_storefront_order(text,integer,text)','EXECUTE') then
    raise exception 'Storefront decision RPC grants are incorrect';
  end if;

  select pg_get_functiondef('public.get_order_public_status(text)'::regprocedure) into v_source;
  if position('consume_public_order_lookup_budget' in v_source)=0
     or position('public_tracking_id' in v_source)=0
     or position('finance_reference_code' in v_source)>0 then
    raise exception 'Full tracking RPC lost limiter/token boundary or leaks Finance reference';
  end if;

  select pg_get_functiondef('public.search_order_public_status(text)'::regprocedure) into v_source;
  if position('consume_public_order_lookup_budget' in v_source)=0
     or position('customer_name_snapshot' in v_source)>0
     or position('delivery_address' in v_source)>0
     or position('payment_status' in v_source)>0 then
    raise exception 'Coarse tracking lookup exposes customer/payment detail';
  end if;

  select pg_get_functiondef('public.confirm_pending_storefront_order(text,integer)'::regprocedure) into v_source;
  if position('order_activities' in v_source)=0
     or position('write_business_activity' in v_source)=0
     or position('STOREFRONT_ORDER_REQUIRED' in v_source)=0 then
    raise exception 'Storefront confirmation lost audit or storefront guard';
  end if;

  select pg_get_functiondef('public.cancel_pending_storefront_order(text,integer,text)'::regprocedure) into v_source;
  if position('order_activities' in v_source)=0
     or position('write_business_activity' in v_source)=0
     or position('CANCELLATION_REASON_REQUIRED' in v_source)=0 then
    raise exception 'Storefront cancellation lost audit or reason guard';
  end if;

  select pg_get_functiondef('private.order_idempotency_result(public.orders,boolean)'::regprocedure) into v_source;
  if position('publicTrackingId' in v_source)=0 then
    raise exception 'Checkout result does not expose opaque tracking id';
  end if;
end $$;
