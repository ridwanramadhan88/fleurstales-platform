-- Fleurstales V3.2 Order authority hardening.
-- The proven V3.1 aggregate writer remains as an internal validator/writer.
-- This public wrapper adds Owner-configured capabilities, exact Undo evidence,
-- florist-before-processing, server-derived actor metadata, and durable events.

begin;

alter function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)
  rename to save_order_operational_state_v31_internal;
revoke execute on function public.save_order_operational_state_v31_internal(text,integer,integer,jsonb,jsonb,jsonb)
  from public, anon, authenticated;

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
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_after public.orders%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_state jsonb;
  v_result jsonb;
  v_actor_name text;
  v_assignment_changed boolean := false;
  v_status_changed boolean := false;
  v_finance_changed boolean := false;
  v_refund_changed boolean := false;
  v_submitted_change_request boolean := false;
  v_resolved_change_request boolean := false;
  v_resubmission boolean := false;
  v_general_changed boolean := false;
  v_items_changed boolean := false;
  v_new_non_refund_payment boolean := false;
  v_new_refund_payment boolean := false;
  v_special_keys text[];
  v_requested_general jsonb;
  v_current_general jsonb;
  v_current_items jsonb;
  v_requested_items jsonb;
  v_pipeline text[];
  v_current_index integer;
  v_next_index integer;
  v_direction text := 'forward';
  v_last_status_metadata jsonb;
  v_next_status text;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id = (select auth.uid()) and is_active = true
  limit 1;
  if not found then raise exception 'STAFF_PROFILE_REQUIRED' using errcode='42501'; end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if not private.can_read_order_row(v_order.branch_id, v_order.florist_assigned_employee_id) then
    raise exception 'ORDER_OUTSIDE_AUTHORIZED_SCOPE' using errcode='42501';
  end if;

  v_actor_name := coalesce(nullif(trim(v_profile.display_name), ''), v_profile.role);
  v_state := coalesce(p_state, '{}'::jsonb);
  v_next_status := coalesce(v_state->>'status', v_order.status);

  v_assignment_changed :=
    coalesce(v_state->>'florist_assigned_employee_id','') is distinct from coalesce(v_order.florist_assigned_employee_id,'')
    or coalesce(v_state->>'florist_display_name','') is distinct from coalesce(v_order.florist_display_name,'')
    or coalesce(v_state->>'florist_assigned_for_date','') is distinct from coalesce(v_order.florist_assigned_for_date::text,'')
    or coalesce(v_state->>'florist_assigned_for_time','') is distinct from coalesce(v_order.florist_assigned_for_time::text,'');
  v_status_changed := v_next_status is distinct from v_order.status;

  v_finance_changed :=
    coalesce((v_state->>'finance_verified')::boolean, false) is distinct from coalesce(v_order.finance_verified,false)
    or nullif(v_state->>'finance_verification_status','') is distinct from v_order.finance_verification_status
    or nullif(v_state->>'finance_verification_note','') is distinct from v_order.finance_verification_note;

  v_resubmission :=
    v_order.finance_verification_status = 'rejected'
    and nullif(v_state->>'finance_verification_status','') is null
    and nullif(v_state->>'finance_resubmitted_at','') is distinct from v_order.finance_resubmitted_at::text;

  v_refund_changed :=
    nullif(v_state->>'refund_amount_idr','')::bigint is distinct from v_order.refund_amount_idr
    or nullif(v_state->>'refund_reason','') is distinct from v_order.refund_reason
    or coalesce(v_state->>'payment_status',v_order.payment_status) in ('refund_pending','refunded')
       and coalesce(v_state->>'payment_status',v_order.payment_status) is distinct from v_order.payment_status
    or nullif(v_state->>'refund_cancellation_reason','') is distinct from v_order.refund_cancellation_reason;

  v_submitted_change_request := v_order.pending_change_request is null and (v_state->'pending_change_request') is not null and (v_state->'pending_change_request') <> 'null'::jsonb;
  v_resolved_change_request := v_order.pending_change_request is not null and ((v_state->'pending_change_request') is null or (v_state->'pending_change_request') = 'null'::jsonb);

  -- Actor/evidence fields are never accepted from browser JSON. Preserve the
  -- authoritative values first, then stamp only the transition actually made.
  v_state := v_state || jsonb_build_object(
    'florist_assigned_by_employee_id', v_order.florist_assigned_by_employee_id,
    'florist_assigned_by_name', v_order.florist_assigned_by_name,
    'florist_assigned_at', v_order.florist_assigned_at,
    'finance_verified_by', v_order.finance_verified_by,
    'finance_verified_at', v_order.finance_verified_at,
    'finance_verification_actor', v_order.finance_verification_actor,
    'finance_verification_at', v_order.finance_verification_at,
    'finance_resubmitted_by', v_order.finance_resubmitted_by,
    'finance_resubmitted_at', v_order.finance_resubmitted_at,
    'refund_initiated_by', v_order.refund_initiated_by,
    'refund_initiated_at', v_order.refund_initiated_at,
    'refund_completed_by', v_order.refund_completed_by,
    'refund_completed_at', v_order.refund_completed_at,
    'refund_cancelled_by', v_order.refund_cancelled_by,
    'refund_cancelled_at', v_order.refund_cancelled_at
  );

  if v_assignment_changed then
    if not private.has_action_permission('orders.assign') then
      raise exception 'ORDER_ASSIGN_PERMISSION_REQUIRED' using errcode='42501';
    end if;
    v_state := v_state || jsonb_build_object(
      'florist_assigned_by_employee_id', v_profile.employee_id,
      'florist_assigned_by_name', v_actor_name,
      'florist_assigned_at', v_now
    );
  end if;

  if v_submitted_change_request then
    if not private.has_action_permission('orders.submit_change_request') then
      raise exception 'ORDER_CHANGE_REQUEST_PERMISSION_REQUIRED' using errcode='42501';
    end if;
    -- The reason/type/id may originate in the UI, but actor evidence never does.
    v_state := jsonb_set(
      v_state,
      '{pending_change_request}',
      coalesce(v_state->'pending_change_request','{}'::jsonb)
        || jsonb_build_object('requestedBy',v_actor_name,'requestedAt',v_now),
      true
    );
  end if;
  if v_resolved_change_request and not private.has_action_permission('orders.resolve_change_request') then
    raise exception 'ORDER_CHANGE_RESOLUTION_PERMISSION_REQUIRED' using errcode='42501';
  end if;

  if v_resubmission then
    if not private.has_action_permission('orders.edit') then
      raise exception 'ORDER_RESUBMIT_PERMISSION_REQUIRED' using errcode='42501';
    end if;
    v_state := v_state || jsonb_build_object(
      'finance_resubmitted_by', v_actor_name,
      'finance_resubmitted_at', v_now
    );
  elsif v_finance_changed then
    if not private.has_action_permission('finance.verify_order') then
      raise exception 'ORDER_VERIFY_PERMISSION_REQUIRED' using errcode='42501';
    end if;
    if coalesce((v_state->>'finance_verified')::boolean,false) and not coalesce(v_order.finance_verified,false) then
      v_state := v_state || jsonb_build_object('finance_verified_by',v_actor_name,'finance_verified_at',v_now);
    end if;
    if nullif(v_state->>'finance_verification_status','') is distinct from v_order.finance_verification_status then
      v_state := v_state || jsonb_build_object('finance_verification_actor',v_actor_name,'finance_verification_at',v_now);
    end if;
  end if;

  if v_refund_changed then
    if not private.has_action_permission('finance.approve_refund') then
      raise exception 'ORDER_REFUND_PERMISSION_REQUIRED' using errcode='42501';
    end if;
    if v_order.payment_status not in ('refund_pending','refunded') and coalesce(v_state->>'payment_status','') = 'refund_pending' then
      v_state := v_state || jsonb_build_object('refund_initiated_by',v_actor_name,'refund_initiated_at',v_now);
    elsif v_order.payment_status = 'refund_pending' and coalesce(v_state->>'payment_status','') = 'refunded' then
      v_state := v_state || jsonb_build_object('refund_completed_by',v_actor_name,'refund_completed_at',v_now);
    elsif v_order.payment_status = 'refund_pending' and coalesce(v_state->>'payment_status','') not in ('refund_pending','refunded') then
      v_state := v_state || jsonb_build_object('refund_cancelled_by',v_actor_name,'refund_cancelled_at',v_now);
    end if;
  end if;

  if v_status_changed then
    if v_resolved_change_request and v_next_status = 'cancelled' then
      if not private.has_action_permission('orders.resolve_change_request') then
        raise exception 'ORDER_CHANGE_RESOLUTION_PERMISSION_REQUIRED' using errcode='42501';
      end if;
    elsif not private.has_action_permission('orders.advance_status') then
      raise exception 'ORDER_STATUS_PERMISSION_REQUIRED' using errcode='42501';
    end if;

    if v_order.status = 'confirmed' and v_next_status = 'processing'
      and nullif(v_state->>'florist_assigned_employee_id','') is null
    then
      raise exception 'FLORIST_REQUIRED_BEFORE_PROCESSING' using errcode='22023';
    end if;

    if v_next_status not in ('cancelled','failed') and v_order.status not in ('cancelled','failed') then
      v_pipeline := case v_order.fulfillment
        when 'delivery' then array['pending_verification','confirmed','processing','ready','delivering','delivered']::text[]
        else array['pending_verification','confirmed','processing','ready','picked_up']::text[]
      end;
      v_current_index := array_position(v_pipeline, v_order.status);
      v_next_index := array_position(v_pipeline, v_next_status);
      if v_current_index is not null and v_next_index = v_current_index - 1 then
        v_direction := 'undo';
        select oa.metadata into v_last_status_metadata
        from public.order_activities oa
        where oa.order_id = p_order_id
          and oa.kind = 'status'
          and oa.metadata->>'direction' = 'forward'
        order by oa.occurred_at desc, oa.created_at desc
        limit 1;
        if v_last_status_metadata is null
          or v_last_status_metadata->>'fromStatus' <> v_next_status
          or v_last_status_metadata->>'toStatus' <> v_order.status
        then
          raise exception 'ORDER_UNDO_EVIDENCE_REQUIRED' using errcode='42501';
        end if;
      end if;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',oi.id,'product_id',oi.product_id,'variant_id',oi.variant_id,
    'product_code_snapshot',oi.product_code_snapshot,'product_name_snapshot',oi.product_name_snapshot,
    'variant_sku_snapshot',oi.variant_sku_snapshot,'variant_size_snapshot',oi.variant_size_snapshot,
    'quantity',oi.quantity,'unit_price_idr',oi.unit_price_idr
  ) order by oi.id),'[]'::jsonb)
  into v_current_items
  from public.order_items oi where oi.order_id = p_order_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]'::jsonb)
  into v_requested_items
  from jsonb_to_recordset(coalesce(p_items,'[]'::jsonb)) as x(
    id text, product_id text, variant_id text, product_code_snapshot text,
    product_name_snapshot text, variant_sku_snapshot text, variant_size_snapshot text,
    quantity integer, unit_price_idr bigint
  );
  v_items_changed := v_requested_items is distinct from v_current_items;

  select exists(
    select 1 from jsonb_to_recordset(coalesce(p_payment_events,'[]'::jsonb)) x(type text,idempotency_key text)
    where not exists(select 1 from public.order_payment_events e where e.idempotency_key=x.idempotency_key)
      and x.type not in ('refund_initiated','refund_completed','refund_cancelled')
  ) into v_new_non_refund_payment;
  select exists(
    select 1 from jsonb_to_recordset(coalesce(p_payment_events,'[]'::jsonb)) x(type text,idempotency_key text)
    where not exists(select 1 from public.order_payment_events e where e.idempotency_key=x.idempotency_key)
      and x.type in ('refund_initiated','refund_completed','refund_cancelled')
  ) into v_new_refund_payment;

  if v_new_refund_payment and not private.has_action_permission('finance.approve_refund') then
    raise exception 'ORDER_REFUND_PERMISSION_REQUIRED' using errcode='42501';
  end if;

  v_special_keys := array[
    'status','florist_display_name','florist_assigned_employee_id','florist_assigned_at',
    'florist_assigned_for_date','florist_assigned_for_time','florist_assigned_by_employee_id',
    'florist_assigned_by_name','florist_schedule_override','florist_schedule_override_reason',
    'florist_scheduled_branch_id','florist_assigned_branch_id','florist_scheduled_shift_start',
    'florist_scheduled_shift_end','processing_started_at','finance_verified','finance_verified_by',
    'finance_verified_at','finance_verification_status','finance_verification_note',
    'finance_verification_actor','finance_verification_at','finance_resubmitted_by',
    'finance_resubmitted_at','finance_resubmission_note','finance_submission_revision',
    'pending_change_request','edit_unlocked','refund_amount_idr','refund_reason','refund_initiated_by',
    'refund_initiated_at','refund_completed_by','refund_completed_at','refund_cancelled_by',
    'refund_cancelled_at','refund_cancellation_reason'
  ];
  if v_refund_changed then
    v_special_keys := v_special_keys || array['payment_status','paid_amount_idr'];
  end if;

  select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
  into v_requested_general
  from jsonb_each(v_state) e
  where not (e.key = any(v_special_keys));

  select coalesce(jsonb_object_agg(k, to_jsonb(v_order)->k),'{}'::jsonb)
  into v_current_general
  from jsonb_object_keys(v_requested_general) k;
  v_general_changed := v_requested_general is distinct from v_current_general;

  if (v_general_changed or v_items_changed or v_new_non_refund_payment)
    and not private.has_action_permission('orders.edit')
  then
    raise exception 'ORDER_EDIT_PERMISSION_REQUIRED' using errcode='42501';
  end if;

  v_result := public.save_order_operational_state_v31_internal(
    p_order_id,p_expected_revision,p_next_revision,v_state,p_items,p_payment_events
  );

  select * into v_after from public.orders where id=p_order_id;

  if v_status_changed then
    insert into public.order_activities(id,order_id,kind,description,actor,occurred_at,metadata)
    values(
      'srv-'||gen_random_uuid()::text,p_order_id,'status',
      case when v_direction='undo' then 'Status undone to '||v_after.status else 'Status changed to '||v_after.status end,
      v_actor_name,v_now,
      jsonb_build_object('fromStatus',v_order.status,'toStatus',v_after.status,'direction',v_direction,'revision',v_after.revision)
    );
  end if;
  if v_assignment_changed then
    insert into public.order_activities(id,order_id,kind,description,actor,occurred_at,metadata)
    values(
      'srv-'||gen_random_uuid()::text,p_order_id,'assignment',
      case when v_after.florist_assigned_employee_id is null then 'Florist assignment cleared' else 'Florist assigned: '||coalesce(v_after.florist_display_name,v_after.florist_assigned_employee_id) end,
      v_actor_name,v_now,
      jsonb_build_object('employeeId',v_after.florist_assigned_employee_id,'revision',v_after.revision)
    );
  end if;

  perform private.write_business_activity(
    'order',p_order_id,v_after.branch_id,
    case when v_status_changed then 'status' when v_assignment_changed then 'assignment' when v_finance_changed then 'finance' when v_refund_changed then 'refund' else 'updated' end,
    'Order '||v_after.order_number||' updated by '||v_actor_name,
    jsonb_build_object('revision',v_after.revision,'status',v_after.status)
  );

  if v_assignment_changed and v_after.florist_assigned_employee_id is not null then
    perform private.notify_employee(
      v_after.florist_assigned_employee_id,'order_assigned','info',
      'Order assigned to you',v_after.order_number||' · '||coalesce(v_after.customer_name_snapshot,'Customer'),
      v_after.branch_id,'order',p_order_id,'order',v_after.order_number
    );
  end if;
  if v_after.finance_verification_status='rejected'
    and v_after.finance_verification_status is distinct from v_order.finance_verification_status
  then
    perform private.notify_roles(
      array['owner','admin'],v_after.branch_id,'finance_rejected','warning',
      'Finance rejected '||v_after.order_number,coalesce(v_after.finance_verification_note,'Correction required.'),
      'order',p_order_id,'order',v_after.order_number
    );
  end if;
  if v_resubmission then
    perform private.notify_roles(
      array['owner','finance'],v_after.branch_id,'admin_resubmitted','warning',
      'Order resubmitted '||v_after.order_number,'Ready for Finance review.',
      'order',p_order_id,'finance_orders',v_after.order_number
    );
  end if;
  if v_submitted_change_request then
    perform private.notify_roles(
      array['owner','finance'],v_after.branch_id,'order_change_requested','warning',
      'Change request '||v_after.order_number,
      coalesce(v_state->'pending_change_request'->>'reason','Finance review required.'),
      'order',p_order_id,'finance_orders',v_after.order_number
    );
  end if;
  if v_resolved_change_request then
    perform private.notify_roles(
      array['owner','admin'],v_after.branch_id,'order_change_resolved','info',
      'Change request resolved '||v_after.order_number,
      'Finance/Owner resolved the pending order change request.',
      'order',p_order_id,'order',v_after.order_number
    );
  end if;

  return v_result;
end;
$$;

revoke execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb) to authenticated;

-- New Storefront/manual orders immediately become durable operational events.
create or replace function private.on_order_created_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.business_activities(
    entity_type,entity_id,branch_id,kind,description,actor_user_id,actor_employee_id,actor_name,actor_role,metadata,occurred_at
  ) values (
    'order',new.id,new.branch_id,'created','Order '||new.order_number||' created',
    (select auth.uid()),null,case when (select auth.uid()) is null then 'Storefront' else 'Staff' end,
    private.current_staff_role(),jsonb_build_object('source',new.source,'status',new.status),now()
  );
  perform private.notify_roles(
    array['owner','admin'],new.branch_id,'order_received','info',
    'New order '||new.order_number,coalesce(new.customer_name_snapshot,'Customer')||' · '||new.fulfillment,
    'order',new.id,'order',new.order_number
  );
  if new.status='pending_verification' then
    perform private.notify_roles(
      array['owner','finance'],new.branch_id,'order_pending_verification','warning',
      new.order_number||' needs verification',coalesce(new.customer_name_snapshot,'Customer')||' · Finance review pending',
      'order',new.id,'finance_orders',new.order_number
    );
  end if;
  return new;
end;
$$;
revoke execute on function private.on_order_created_event() from public, anon, authenticated;

drop trigger if exists trg_orders_created_event on public.orders;
create trigger trg_orders_created_event
after insert on public.orders
for each row execute function private.on_order_created_event();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='orders'
  ) then alter publication supabase_realtime add table public.orders; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='order_activities'
  ) then alter publication supabase_realtime add table public.order_activities; end if;
end;
$$;

commit;
