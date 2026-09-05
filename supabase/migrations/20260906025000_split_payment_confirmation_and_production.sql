-- Separate payment confirmation from production start.
-- Payment confirmation owns receiving-account capture, transfer proof, and
-- Finance Money In. Production start requires an already-paid order and only
-- assigns the florist / moves the order to Processing.

begin;

create or replace function public.confirm_order_payment_with_proof(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text,
  p_payment_proof_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_proof text := nullif(trim(coalesce(p_payment_proof_path,'')),'');
  v_payment_revision integer;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode='P0002';
  end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_order.revision using errcode='40001';
  end if;
  if v_order.status <> 'confirmed' then
    raise exception 'ORDER_MUST_BE_CONFIRMED_BEFORE_PAYMENT_CONFIRMATION' using errcode='22023';
  end if;

  if v_order.payment_method = 'transfer' then
    if v_proof is null or v_proof not like v_order.id || '/proof-%.jpg' then
      raise exception 'PAYMENT_PROOF_REQUIRED_FOR_TRANSFER' using errcode='22023';
    end if;

    update public.orders
    set payment_proof_url=v_proof,
        updated_at=clock_timestamp()
    where id=v_order.id
    returning revision into v_payment_revision;
  elsif v_order.payment_method = 'cash' then
    if v_order.storefront_idempotency_key is not null or v_order.source='customer_app' then
      raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode='22023';
    end if;
    v_proof := null;
    v_payment_revision := v_order.revision;
  else
    raise exception 'PAYMENT_METHOD_REQUIRED' using errcode='22023';
  end if;

  v_result := public.confirm_order_payment_for_processing(
    p_order_id,
    v_payment_revision,
    p_finance_account_id
  );

  return v_result || jsonb_build_object('paymentProofPath',v_proof);
end;
$$;

revoke execute on function public.confirm_order_payment_with_proof(text,integer,text,text) from public, anon;
grant execute on function public.confirm_order_payment_with_proof(text,integer,text,text) to authenticated, service_role;

create or replace function public.start_paid_order_production(
  p_order_id text,
  p_expected_revision integer,
  p_florist_employee_id text,
  p_assignment_date date,
  p_assignment_time time without time zone default null,
  p_allow_schedule_override boolean default false,
  p_scheduled_branch_id text default null,
  p_shift_start time without time zone default null,
  p_shift_end time without time zone default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_role text := private.current_staff_role();
  v_employee_id text := private.current_staff_employee_id();
  v_actor_name text;
  v_florist jsonb;
  v_florist_name text;
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if v_role not in ('owner','admin') or not private.has_action_permission('orders.advance_status') then
    raise exception 'PROCESS_ORDER_NOT_PERMITTED' using errcode='42501';
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_order.revision using errcode='40001';
  end if;
  if v_order.status <> 'confirmed' then
    raise exception 'ORDER_MUST_BE_CONFIRMED_BEFORE_PROCESSING' using errcode='22023';
  end if;
  if v_order.payment_status <> 'paid' or coalesce(v_order.paid_amount_idr,0) < v_order.total_idr then
    raise exception 'PAYMENT_MUST_BE_CONFIRMED_BEFORE_PROCESSING' using errcode='22023';
  end if;
  if v_order.payment_method='transfer' and nullif(trim(coalesce(v_order.payment_proof_url,'')),'') is null then
    raise exception 'PAYMENT_PROOF_REQUIRED_FOR_TRANSFER' using errcode='22023';
  end if;
  if p_florist_employee_id is null or trim(p_florist_employee_id)='' then
    raise exception 'FLORIST_REQUIRED' using errcode='22023';
  end if;

  select employee
  into v_florist
  from private.operational_domain_state state,
       lateral jsonb_array_elements(coalesce(state.snapshot->'employees','[]'::jsonb)) employee
  where state.domain='hr'
    and employee->>'id'=p_florist_employee_id
  limit 1;

  if v_florist is null
     or coalesce(v_florist->>'status','') <> 'active'
     or coalesce(v_florist->>'systemRole','') <> 'florist' then
    raise exception 'ACTIVE_FLORIST_REQUIRED' using errcode='22023';
  end if;
  v_florist_name := coalesce(nullif(trim(v_florist->>'name'),''),p_florist_employee_id);

  select display_name into v_actor_name
  from public.staff_access_profiles
  where employee_id=v_employee_id and is_active=true
  limit 1;
  v_actor_name := coalesce(nullif(trim(v_actor_name,'')),v_role,'Admin');

  update public.orders
  set status='processing',
      florist_display_name=v_florist_name,
      florist_assigned_employee_id=p_florist_employee_id,
      florist_assigned_at=v_now,
      florist_assigned_for_date=coalesce(p_assignment_date,timezone('Asia/Jakarta',v_now)::date),
      florist_assigned_for_time=p_assignment_time,
      florist_assigned_by_employee_id=v_employee_id,
      florist_assigned_by_name=v_actor_name,
      florist_schedule_override=coalesce(p_allow_schedule_override,false),
      florist_schedule_override_reason=case when coalesce(p_allow_schedule_override,false) then 'Confirmed during Process Order' else null end,
      florist_scheduled_branch_id=nullif(trim(coalesce(p_scheduled_branch_id,'')),''),
      florist_assigned_branch_id=v_order.branch_id,
      florist_scheduled_shift_start=p_shift_start,
      florist_scheduled_shift_end=p_shift_end,
      processing_started_at=v_now,
      admin_handled_employee_id=coalesce(admin_handled_employee_id,v_employee_id),
      admin_handled_by_name=coalesce(admin_handled_by_name,v_actor_name),
      revision=revision+1,
      updated_at=v_now
  where id=v_order.id
  returning * into v_order;

  perform private.sync_order_contribution_points(v_order.id);

  insert into public.order_activities(id,order_id,kind,description,actor,occurred_at,metadata)
  values(
    'activity_'||replace(gen_random_uuid()::text,'-',''),
    v_order.id,
    'status',
    'Order moved to Processing and florist assigned.',
    v_actor_name,
    v_now,
    jsonb_build_object(
      'fromStatus','confirmed',
      'toStatus','processing',
      'direction','forward',
      'floristEmployeeId',p_florist_employee_id,
      'floristName',v_florist_name,
      'scheduleOverride',coalesce(p_allow_schedule_override,false)
    )
  );

  perform private.write_business_activity(
    'order',v_order.id,v_order.branch_id,'processed',
    'Production started after payment confirmation.',
    jsonb_build_object(
      'orderNumber',v_order.order_number,
      'floristEmployeeId',p_florist_employee_id,
      'floristName',v_florist_name,
      'startedAt',v_now
    )
  );

  return jsonb_build_object(
    'orderId',v_order.id,
    'orderNumber',v_order.order_number,
    'revision',v_order.revision,
    'status',v_order.status,
    'floristEmployeeId',p_florist_employee_id,
    'floristName',v_florist_name,
    'startedAt',v_now
  );
end;
$$;

revoke execute on function public.start_paid_order_production(
  text,integer,text,date,time without time zone,boolean,text,time without time zone,time without time zone
) from public, anon;
grant execute on function public.start_paid_order_production(
  text,integer,text,date,time without time zone,boolean,text,time without time zone,time without time zone
) to authenticated, service_role;

-- Close the old combined payment+production entry points to normal clients.
revoke execute on function public.process_order_for_production(
  text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone
) from authenticated;
revoke execute on function public.process_order_for_production_with_proof(
  text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone,text
) from authenticated;

commit;
