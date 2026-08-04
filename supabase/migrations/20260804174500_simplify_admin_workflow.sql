-- Simple, reliable Admin operations:
-- 1. Customer orders wait for Admin confirmation, not Finance reconciliation.
-- 2. Admin-created orders are confirmed during creation.
-- 3. Admin production sessions require one dated branch assignment.
-- 4. PostgreSQL rejects skipped normal fulfillment statuses.
-- 5. Finance is notified only after fulfillment is completed.

create or replace function private.on_order_created_event()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.source not in ('whatsapp','walk_in') then
    insert into public.business_activities(
      entity_type,entity_id,branch_id,kind,description,actor_user_id,actor_employee_id,actor_name,actor_role,metadata,occurred_at
    ) values (
      'order',new.id,new.branch_id,'created','Order '||new.order_number||' created',
      (select auth.uid()),null,case when (select auth.uid()) is null then 'Storefront' else 'Staff' end,
      private.current_staff_role(),jsonb_build_object('source',new.source,'status',new.status),now()
    );
  end if;

  perform private.notify_roles(
    array['owner','admin'],new.branch_id,'order_received','info',
    case
      when new.source in ('whatsapp','walk_in') then 'New internal order '||new.order_number
      else 'New order awaiting confirmation '||new.order_number
    end,
    coalesce(new.customer_name_snapshot,'Customer')||' · '||new.fulfillment,
    'order',new.id,'order',new.order_number
  );

  return new;
end;
$function$;
revoke execute on function private.on_order_created_event() from public, anon, authenticated;

create or replace function public.set_staff_runtime_context(
  p_scheduled_branch_id text,
  p_operational_branch_id text,
  p_operational_date date
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_role text := private.current_staff_role();
  v_employee_id text := private.current_staff_employee_id();
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_session_id uuid := nullif((select auth.jwt()->>'session_id'),'')::uuid;
  v_previous_operational text;
  v_shift jsonb;
  v_required_branch text;
begin
  if (select auth.uid()) is null or v_role is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_session_id is null then raise exception 'AUTH_SESSION_REQUIRED' using errcode='42501'; end if;
  if p_operational_date <> v_today then raise exception 'RUNTIME_CONTEXT_DATE_MUST_BE_TODAY' using errcode='22023'; end if;
  if v_role in ('admin','florist') and p_operational_branch_id is null then
    raise exception 'OPERATIONAL_BRANCH_REQUIRED' using errcode='22023';
  end if;
  if p_scheduled_branch_id is not null and not exists(select 1 from public.branches where id=p_scheduled_branch_id and is_active=true) then
    raise exception 'INVALID_SCHEDULED_BRANCH' using errcode='22023';
  end if;
  if p_operational_branch_id is not null and not exists(select 1 from public.branches where id=p_operational_branch_id and is_active=true) then
    raise exception 'INVALID_OPERATIONAL_BRANCH' using errcode='22023';
  end if;

  if v_role='admin' then
    select shift
    into v_shift
    from public.staff_schedule_overrides
    where employee_id=v_employee_id
      and schedule_date=v_today;

    if v_shift is null
      or not coalesce((v_shift->>'isWorking')::boolean,false)
      or nullif(v_shift->>'branchId','') is null
    then
      raise exception 'ADMIN_DATED_BRANCH_REQUIRED' using errcode='42501';
    end if;

    v_required_branch:=v_shift->>'branchId';
    if p_scheduled_branch_id is distinct from v_required_branch
      or p_operational_branch_id is distinct from v_required_branch
    then
      raise exception 'ADMIN_BRANCH_SCOPE_REQUIRED' using errcode='42501';
    end if;
  end if;

  select operational_branch_id into v_previous_operational
  from private.staff_runtime_context
  where session_id=v_session_id
    and user_id=(select auth.uid())
    and operational_date=p_operational_date;

  insert into private.staff_runtime_context(session_id,user_id,operational_date,scheduled_branch_id,operational_branch_id,updated_at)
  values (v_session_id,(select auth.uid()),p_operational_date,p_scheduled_branch_id,p_operational_branch_id,now())
  on conflict(session_id) do update
  set user_id=excluded.user_id,
      operational_date=excluded.operational_date,
      scheduled_branch_id=excluded.scheduled_branch_id,
      operational_branch_id=excluded.operational_branch_id,
      updated_at=excluded.updated_at;

  if v_previous_operational is distinct from p_operational_branch_id then
    perform private.write_business_activity(
      'hr',v_session_id::text,p_operational_branch_id,'operational_branch_changed',
      'Staff operational branch changed.',
      jsonb_build_object(
        'activityScope','staff_runtime',
        'sessionId',v_session_id,
        'scheduledBranchId',p_scheduled_branch_id,
        'previousOperationalBranchId',v_previous_operational,
        'operationalBranchId',p_operational_branch_id
      )
    );
  end if;

  return jsonb_build_object(
    'sessionId',v_session_id,
    'scheduledBranchId',p_scheduled_branch_id,
    'operationalBranchId',p_operational_branch_id,
    'operationalDate',p_operational_date,
    'updatedAt',now()
  );
end;
$function$;
revoke execute on function public.set_staff_runtime_context(text,text,date) from public, anon;
grant execute on function public.set_staff_runtime_context(text,text,date) to authenticated;

create or replace function public.create_internal_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_key text:=trim(coalesce(p_payload->>'idempotencyKey',''));
  v_hash text;
  v_legacy_hash text;
  v_existing public.orders%rowtype;
  v_result jsonb;
  v_normalized text;
  v_existing_customer public.customers%rowtype;
  v_customer_id text;
  v_dedup boolean;
  v_expected_quote jsonb:=p_payload->'expectedQuote';
  v_authoritative_quote jsonb;
  v_profile public.staff_access_profiles%rowtype;
begin
  if length(v_key)<16 or length(v_key)>128 then raise exception 'VALID_IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  v_hash:=private.jsonb_request_hash(private.internal_order_semantic_payload(p_payload));
  v_legacy_hash:=private.jsonb_request_hash(coalesce(p_payload,'{}'::jsonb)-'idempotencyKey');
  perform pg_advisory_xact_lock(hashtextextended('internal-order:'||v_key,0));

  select * into v_existing from public.orders where storefront_idempotency_key=v_key limit 1;
  if found then
    if v_existing.idempotency_request_hash is null or v_existing.idempotency_request_hash not in (v_hash,v_legacy_hash) then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023';
    end if;
    return private.order_idempotency_result(v_existing,true);
  end if;

  if v_expected_quote is not null then
    if jsonb_typeof(v_expected_quote)<>'object' then raise exception 'INVALID_EXPECTED_QUOTE' using errcode='22023'; end if;
    v_authoritative_quote:=public.quote_internal_order(p_payload-'expectedQuote');
    if coalesce((v_expected_quote->>'itemsSubtotalIdr')::bigint,-1)<>coalesce((v_authoritative_quote->>'itemsSubtotalIdr')::bigint,-2)
      or coalesce((v_expected_quote->>'deliveryFeeIdr')::bigint,-1)<>coalesce((v_authoritative_quote->>'deliveryFeeIdr')::bigint,-2)
      or coalesce((v_expected_quote->>'discountIdr')::bigint,-1)<>coalesce((v_authoritative_quote->>'discountIdr')::bigint,-2)
      or coalesce((v_expected_quote->>'totalIdr')::bigint,-1)<>coalesce((v_authoritative_quote->>'totalIdr')::bigint,-2)
      or coalesce((v_expected_quote->>'promoAccepted')::boolean,false)<>coalesce((v_authoritative_quote->>'promoAccepted')::boolean,false)
    then
      raise exception 'ORDER_QUOTE_CHANGED' using errcode='40001';
    end if;
  end if;

  v_normalized:=private.normalize_whatsapp(p_payload->'customer'->>'whatsappNumber');
  select * into v_existing_customer from public.customers where normalized_whatsapp_number=v_normalized limit 1;
  v_result:=public.create_internal_order_v36_internal(p_payload);
  v_dedup:=coalesce((v_result->>'deduplicated')::boolean,false);
  v_customer_id:=v_result->>'customerId';
  select * into v_existing from public.orders where id=v_result->>'orderId';

  if v_existing.idempotency_request_hash is not null and v_existing.idempotency_request_hash not in (v_hash,v_legacy_hash) then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023';
  end if;
  update public.orders set idempotency_request_hash=v_hash where id=v_existing.id;

  if not v_dedup and v_existing_customer.id is not null and v_customer_id=v_existing_customer.id then
    update public.customers set revision=revision+1,updated_at=now() where id=v_customer_id;
  end if;

  if not v_dedup then
    select * into v_profile
    from public.staff_access_profiles
    where user_id=(select auth.uid()) and is_active=true
    limit 1;

    update public.orders
    set status='confirmed',updated_at=now()
    where id=v_existing.id and status='pending_verification';

    if found then
      insert into public.order_activities(id,order_id,kind,description,actor,occurred_at,metadata)
      values(
        'activity_'||replace(gen_random_uuid()::text,'-',''),v_existing.id,'status',
        'Admin-created order confirmed at creation.',
        coalesce(nullif(trim(v_profile.display_name),''),v_profile.role),now(),
        jsonb_build_object('fromStatus','pending_verification','toStatus','confirmed','direction','forward','creationConfirmation',true)
      );
      perform private.write_business_activity(
        'order',v_existing.id,v_existing.branch_id,'confirmed',
        'Admin-created order confirmed at creation.',
        jsonb_build_object('orderNumber',v_existing.order_number,'status','confirmed')
      );
    end if;

    delete from public.staff_notifications
    where entity_type='order'
      and entity_id=v_existing.id
      and kind='order_pending_verification';
  end if;

  select * into v_existing from public.orders where id=v_result->>'orderId';
  return private.order_idempotency_result(v_existing,v_dedup);
end;
$function$;
revoke execute on function public.create_internal_order(jsonb) from public, anon;
grant execute on function public.create_internal_order(jsonb) to authenticated;

create or replace function public.save_order_operational_state(
  p_order_id text,
  p_expected_revision integer,
  p_next_revision integer,
  p_state jsonb,
  p_items jsonb default '[]'::jsonb,
  p_payment_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_before public.orders%rowtype;
  v_after public.orders%rowtype;
  v_state jsonb:=coalesce(p_state,'{}'::jsonb);
  v_next_status text;
  v_pipeline text[];
  v_current_index integer;
  v_next_index integer;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id=(select auth.uid()) and is_active=true
  limit 1;

  if not found then raise exception 'ORDER_WRITE_FORBIDDEN' using errcode='42501'; end if;
  if v_profile.role='florist' then raise exception 'FLORIST_ORDER_READ_ONLY' using errcode='42501'; end if;
  if v_profile.role not in ('owner','admin','finance') then raise exception 'ORDER_WRITE_FORBIDDEN' using errcode='42501'; end if;

  select * into v_before from public.orders where id=p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;

  v_next_status:=coalesce(v_state->>'status',v_before.status);
  if v_next_status is distinct from v_before.status then
    if v_before.status in ('cancelled','failed') then
      raise exception 'TERMINAL_ORDER_STATUS' using errcode='22023';
    end if;

    if v_next_status not in ('cancelled','failed') then
      v_pipeline:=case v_before.fulfillment
        when 'delivery' then array['pending_verification','confirmed','processing','ready','delivering','delivered']::text[]
        else array['pending_verification','confirmed','processing','ready','picked_up']::text[]
      end;
      v_current_index:=array_position(v_pipeline,v_before.status);
      v_next_index:=array_position(v_pipeline,v_next_status);

      if v_current_index is null
        or v_next_index is null
        or v_next_index not in (v_current_index+1,v_current_index-1)
      then
        raise exception 'ORDER_STATUS_SEQUENCE_REQUIRED' using errcode='22023';
      end if;
    end if;
  end if;

  v_result:=public.save_order_operational_state_v37_internal(
    p_order_id,p_expected_revision,p_next_revision,v_state,p_items,p_payment_events
  );

  select * into v_after from public.orders where id=p_order_id;
  if v_before.status not in ('delivered','picked_up')
    and v_after.status in ('delivered','picked_up')
  then
    perform private.notify_roles(
      array['owner','finance'],v_after.branch_id,'order_pending_verification','warning',
      'Ready for reconciliation',
      v_after.order_number||' · '||coalesce(v_after.customer_name_snapshot,'Customer'),
      'order',v_after.id,'finance_orders',v_after.order_number
    );
  end if;

  return v_result;
end;
$function$;
revoke execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) to authenticated;
