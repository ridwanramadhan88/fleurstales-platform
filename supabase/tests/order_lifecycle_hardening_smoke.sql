-- Order lifecycle hardening contract: secure universal tracking, terminal expiry,
-- mandatory lifecycle evidence, private Finance-only transfer proof reads, and
-- Admin branch-aware media writes.

do $$
declare
  v_source text;
  v_policy text;
  v_bucket_public boolean;
  v_bucket_limit bigint;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='finish_photo_url'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='payment_proof_url'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='terminal_at'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='orders' and column_name='tracking_expires_at'
  ) then
    raise exception 'Order lifecycle media/expiry columns are incomplete';
  end if;

  select public, file_size_limit into v_bucket_public, v_bucket_limit
  from storage.buckets where id='order-finish-photos';
  if v_bucket_public is distinct from true or v_bucket_limit <> 102400 then
    raise exception 'Finish photo bucket must be public and capped at 100 KB';
  end if;

  select public, file_size_limit into v_bucket_public, v_bucket_limit
  from storage.buckets where id='order-payment-proofs';
  if v_bucket_public is distinct from false or v_bucket_limit <> 307200 then
    raise exception 'Payment proof bucket must be private and capped at 300 KB';
  end if;

  if not has_function_privilege('anon','public.verify_order_tracking_access(text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.verify_order_tracking_access(text,text)','EXECUTE') then
    raise exception 'Secure tracking access grants are incorrect';
  end if;
  if not has_function_privilege('anon','public.get_order_public_status(text)','EXECUTE')
     or has_function_privilege('authenticated','public.get_order_public_status(text)','EXECUTE') then
    raise exception 'Public tracking status grants are incorrect';
  end if;
  if has_function_privilege('anon','public.search_order_public_status(text)','EXECUTE')
     or has_function_privilege('authenticated','public.search_order_public_status(text)','EXECUTE')
     or not has_function_privilege('service_role','public.search_order_public_status(text)','EXECUTE') then
    raise exception 'Order-number-only tracking lookup is still publicly executable';
  end if;
  if not has_function_privilege('authenticated','public.attach_order_finish_photo(text,integer,text,text)','EXECUTE')
     or has_function_privilege('anon','public.attach_order_finish_photo(text,integer,text,text)','EXECUTE') then
    raise exception 'Finish photo attachment grants are incorrect';
  end if;
  if not has_function_privilege(
       'authenticated',
       'public.process_order_for_production_with_proof(text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone,text)',
       'EXECUTE'
     ) or has_function_privilege(
       'anon',
       'public.process_order_for_production_with_proof(text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone,text)',
       'EXECUTE'
     ) then
    raise exception 'Atomic Process Order with proof grants are incorrect';
  end if;

  select pg_get_functiondef('public.verify_order_tracking_access(text,text)'::regprocedure) into v_source;
  if position('tracking_expires_at' in v_source)=0
     or position('normalize_whatsapp' in v_source)=0
     or position('customer_app' in v_source)>0 then
    raise exception 'Tracking verification is not universal + WhatsApp-gated + expiry-aware';
  end if;

  select pg_get_functiondef('public.get_order_public_status(text)'::regprocedure) into v_source;
  if position('tracking_expires_at' in v_source)=0
     or position('finishPhotoUrl' in v_source)=0
     or position('customer_app' in v_source)>0 then
    raise exception 'Public tracking reader is not universal/expiry-aware or lost finish photo';
  end if;

  select pg_get_functiondef('public.submit_order_review(text,jsonb,text)'::regprocedure) into v_source;
  if position('tracking_expires_at' in v_source)=0 then
    raise exception 'Review submission no longer follows tracking expiry';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid
    join pg_namespace pn on pn.oid=p.pronamespace
    where n.nspname='public'
      and c.relname='orders'
      and t.tgname='orders_lifecycle_media_guard'
      and not t.tgisinternal
      and pn.nspname='private'
      and p.proname='enforce_order_lifecycle_media'
  ) then
    raise exception 'Order lifecycle media trigger is missing';
  end if;

  select pg_get_functiondef('private.enforce_order_lifecycle_media()'::regprocedure) into v_source;
  if position('FINISH_PHOTO_REQUIRED_BEFORE_READY' in v_source)=0
     or position('PAYMENT_PROOF_REQUIRED_FOR_TRANSFER' in v_source)=0
     or position('tracking_expires_at' in v_source)=0
     or position('14 days' in v_source)=0 then
    raise exception 'Order lifecycle trigger lost mandatory evidence or terminal expiry enforcement';
  end if;

  select pg_get_functiondef('private.can_write_order_media_object(text)'::regprocedure) into v_source;
  if position('current_staff_branch_id' in v_source)=0
     or position('orders.advance_status' in v_source)=0
     or position('owner' in lower(v_source))=0
     or position('admin' in lower(v_source))=0 then
    raise exception 'Lifecycle media Storage writes are not role/branch/capability-aware';
  end if;

  select with_check into v_policy
  from pg_policies
  where schemaname='storage' and tablename='objects' and policyname='order_payment_proofs_storage_insert';
  if v_policy is null or position('can_write_order_media_object' in v_policy)=0 then
    raise exception 'Payment proof upload policy lost order/branch authorization';
  end if;

  select qual into v_policy
  from pg_policies
  where schemaname='storage' and tablename='objects' and policyname='order_payment_proofs_storage_select';
  if v_policy is null
     or position('current_staff_role' in v_policy)=0
     or position('finance' in lower(v_policy))=0 then
    raise exception 'Payment proof read policy is not Finance-only';
  end if;

  select pg_get_functiondef(
    'public.process_order_for_production_with_proof(text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone,text)'::regprocedure
  ) into v_source;
  if position('PAYMENT_PROOF_REQUIRED_FOR_TRANSFER' in v_source)=0
     or position('process_order_for_production' in v_source)=0
     or position('payment_proof_url' in v_source)=0 then
    raise exception 'Atomic Process Order wrapper lost proof validation/attachment or core processing call';
  end if;
end $$;
