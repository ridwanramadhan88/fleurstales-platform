-- Process Order is one authoritative transaction: full payment verification,
-- receiving-account capture, florist assignment, Finance Money In, and the
-- transition to Processing either all commit or all roll back.

begin;

create or replace function public.process_order_for_production(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text,
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
  v_account_id text := trim(coalesce(p_finance_account_id,''));
  v_event public.order_payment_events%rowtype;
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
  if v_order.payment_status='partial' then
    raise exception 'PARTIAL_PAYMENT_NOT_SUPPORTED' using errcode='22023';
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

  if v_order.payment_method='cash' then
    if v_order.storefront_idempotency_key is not null or v_order.source='customer_app' then
      raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode='22023';
    end if;
    v_account_id := 'cash:main';
  else
    if v_order.payment_method is distinct from 'transfer' then
      raise exception 'PAYMENT_METHOD_REQUIRED' using errcode='22023';
    end if;
    if not exists(
      select 1
      from public.public_payment_accounts account
      where account.id=v_account_id
        and account.is_active=true
        and (cardinality(account.branch_ids)=0 or v_order.branch_id=any(account.branch_ids))
    ) then
      raise exception 'VALID_RECEIVING_ACCOUNT_REQUIRED' using errcode='22023';
    end if;
  end if;

  select display_name into v_actor_name
  from public.staff_access_profiles
  where employee_id=v_employee_id and is_active=true
  limit 1;
  v_actor_name := coalesce(nullif(trim(v_actor_name),''),v_role,'Admin');

  select * into v_event
  from public.order_payment_events
  where order_id=v_order.id and type='payment_received'
  order by occurred_at desc, id desc
  limit 1
  for update;

  if v_order.payment_status='paid' and found then
    update public.order_payment_events
    set finance_account_id=v_account_id,
        occurred_at=v_now,
        actor_id=v_employee_id,
        actor_name=v_actor_name,
        amount_idr=v_order.total_idr,
        previous_paid_amount_idr=0,
        resulting_paid_amount_idr=v_order.total_idr,
        resulting_status='paid',
        method=v_order.payment_method,
        note='Full payment verified during Process Order'
    where id=v_event.id
    returning * into v_event;
  else
    if v_order.payment_status <> 'unpaid' then
      raise exception 'ORDER_PAYMENT_STATE_INVALID' using errcode='22023';
    end if;

    insert into public.order_payment_events(
      id,order_id,type,amount_idr,previous_paid_amount_idr,resulting_paid_amount_idr,
      resulting_status,method,note,actor_id,actor_name,occurred_at,idempotency_key,
      finance_account_id
    ) values (
      'pay_'||replace(gen_random_uuid()::text,'-',''),
      v_order.id,'payment_received',v_order.total_idr,0,v_order.total_idr,
      'paid',v_order.payment_method,'Full payment verified during Process Order',
      v_employee_id,v_actor_name,v_now,'process-payment:'||v_order.id,v_account_id
    )
    on conflict (idempotency_key) do update
      set finance_account_id=excluded.finance_account_id,
          actor_id=excluded.actor_id,
          actor_name=excluded.actor_name,
          amount_idr=excluded.amount_idr,
          previous_paid_amount_idr=excluded.previous_paid_amount_idr,
          resulting_paid_amount_idr=excluded.resulting_paid_amount_idr,
          resulting_status=excluded.resulting_status,
          method=excluded.method,
          occurred_at=excluded.occurred_at,
          note=excluded.note
    returning * into v_event;
  end if;

  update public.orders
  set payment_status='paid',
      paid_amount_idr=total_idr,
      status='processing',
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

  perform private.sync_order_finance_transactions(v_order.id);
  perform private.sync_order_contribution_points(v_order.id);

  insert into public.order_activities(id,order_id,kind,description,actor,occurred_at,metadata)
  values(
    'activity_'||replace(gen_random_uuid()::text,'-',''),
    v_order.id,
    'status',
    'Full payment verified and order moved to Processing.',
    v_actor_name,
    v_now,
    jsonb_build_object(
      'fromStatus','confirmed',
      'toStatus','processing',
      'direction','forward',
      'financeAccountId',v_account_id,
      'floristEmployeeId',p_florist_employee_id,
      'floristName',v_florist_name,
      'scheduleOverride',coalesce(p_allow_schedule_override,false)
    )
  );

  perform private.write_business_activity(
    'order',v_order.id,v_order.branch_id,'processed',
    'Full payment verified and production started.',
    jsonb_build_object(
      'orderNumber',v_order.order_number,
      'financeAccountId',v_account_id,
      'amountIdr',v_order.total_idr,
      'paymentVerifiedAt',v_now,
      'floristEmployeeId',p_florist_employee_id,
      'floristName',v_florist_name
    )
  );

  return jsonb_build_object(
    'orderId',v_order.id,
    'orderNumber',v_order.order_number,
    'revision',v_order.revision,
    'status',v_order.status,
    'paymentStatus',v_order.payment_status,
    'paidAmountIdr',v_order.paid_amount_idr,
    'financeAccountId',v_account_id,
    'paymentVerifiedAt',v_now,
    'ledgerTransactionId',v_event.ledger_transaction_id,
    'floristEmployeeId',p_florist_employee_id,
    'floristName',v_florist_name
  );
end;
$$;

revoke execute on function public.process_order_for_production(
  text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone
) from public, anon;
grant execute on function public.process_order_for_production(
  text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone
) to authenticated, service_role;

commit;
