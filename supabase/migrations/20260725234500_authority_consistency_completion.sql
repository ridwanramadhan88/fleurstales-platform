-- Fleurstales V3.7 — authority consistency completion
-- Runtime branch writes, authoritative internal quotes/CRM metrics, point commands,
-- Finance actor stamping, private attendance evidence, and deployment smoke gates.

begin;

create or replace function public.save_order_operational_state_v31_internal(
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
  v_next public.orders%rowtype;
  v_profile public.staff_access_profiles%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_current_items jsonb;
  v_requested_items jsonb;
  v_current_payment_events jsonb;
  v_requested_payment_events jsonb;
  v_new_payment_events jsonb;
  v_locked boolean;
  v_finished boolean;
  v_details_changed boolean;
  v_assignment_changed boolean;
  v_status_changed boolean;
  v_payment_changed boolean;
  v_refund_changed boolean;
  v_finance_changed boolean;
  v_change_control_changed boolean;
  v_resubmission boolean;
  v_submitted_change_request boolean;
  v_resolved_change_request boolean;
  v_finalizing_unlocked_edit boolean;
  v_item_count integer;
  v_item_subtotal bigint;
  v_current_status_index integer;
  v_next_status_index integer;
  v_pipeline text[];
  v_event jsonb;
  v_event_type text;
  v_last_new_event jsonb;
  v_request_type text;
  v_request_reason text;
  v_actor_name text;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id = (select auth.uid())
    and is_active = true
  limit 1;

  if not found or v_profile.role not in ('owner','admin','finance','florist') then
    raise exception 'ORDER_WRITE_FORBIDDEN' using errcode = '42501';
  end if;

  v_actor_name := coalesce(nullif(trim(v_profile.display_name), ''), v_profile.role);

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_profile.role = 'admin'
    and (private.current_staff_branch_id() is null or private.current_staff_branch_id() <> v_order.branch_id)
  then
    raise exception 'ORDER_OUTSIDE_BRANCH_SCOPE' using errcode = '42501';
  end if;

  if p_expected_revision is null or v_order.revision <> p_expected_revision then
    perform private.write_audit_event(
      'order.operational.save', 'order', p_order_id, 'conflict',
      v_order.revision, p_next_revision,
      jsonb_build_object('status', v_order.status, 'paymentStatus', v_order.payment_status),
      coalesce(p_state, '{}'::jsonb),
      jsonb_build_object('expectedRevision', p_expected_revision)
    );
    raise exception 'REVISION_CONFLICT:order:%:expected=%:actual=%',
      p_order_id, p_expected_revision, v_order.revision
      using errcode = '40001';
  end if;

  -- The orders trigger advances exactly one revision per committed mutation.
  -- A browser that accumulated several local revisions replays the latest
  -- desired state one server revision at a time until it catches up.
  if p_next_revision is null or p_next_revision <> p_expected_revision + 1 then
    raise exception 'INVALID_NEXT_REVISION' using errcode = '22023';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'INVALID_ORDER_STATE' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ORDER_ITEMS' using errcode = '22023';
  end if;
  if p_payment_events is null or jsonb_typeof(p_payment_events) <> 'array' then
    raise exception 'INVALID_PAYMENT_EVENTS' using errcode = '22023';
  end if;

  -- Merge the requested mutable state into the authoritative row. Immutable
  -- identity/scope fields are restored after the merge so a client can never
  -- move an order to another branch or rewrite its identity/idempotency key.
  select * into v_next
  from pg_catalog.jsonb_populate_record(
    null::public.orders,
    to_jsonb(v_order)
      || p_state
      || jsonb_build_object(
        'id', v_order.id,
        'order_number', v_order.order_number,
        'storefront_idempotency_key', v_order.storefront_idempotency_key,
        'branch_id', v_order.branch_id,
        'revision', p_next_revision,
        'created_at', v_order.created_at,
        'updated_at', v_now
      )
  );

  if v_next.status not in (
    'pending_verification','confirmed','processing','ready','delivering',
    'delivered','picked_up','cancelled','failed'
  ) then
    raise exception 'INVALID_ORDER_STATUS' using errcode = '22023';
  end if;
  if v_next.payment_status not in ('unpaid','partial','paid','refund_pending','refunded') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = '22023';
  end if;
  if v_next.source not in ('whatsapp','walk_in','customer_app') then
    raise exception 'INVALID_ORDER_SOURCE' using errcode = '22023';
  end if;
  if v_next.fulfillment not in ('delivery','pickup') then
    raise exception 'INVALID_ORDER_FULFILLMENT' using errcode = '22023';
  end if;
  if v_next.payment_method is not null and v_next.payment_method not in ('cash','transfer') then
    raise exception 'INVALID_PAYMENT_METHOD' using errcode = '22023';
  end if;
  if v_next.fulfillment = 'delivery' and v_next.payment_method = 'cash' then
    raise exception 'DELIVERY_REQUIRES_TRANSFER' using errcode = '22023';
  end if;
  if v_next.total_idr is null or v_next.total_idr < 0
    or v_next.items_subtotal_idr is null or v_next.items_subtotal_idr < 0
    or v_next.discount_idr is null or v_next.discount_idr < 0
    or v_next.delivery_fee_idr is null or v_next.delivery_fee_idr < 0
  then
    raise exception 'INVALID_ORDER_TOTALS' using errcode = '22023';
  end if;
  if v_next.total_idr <> greatest(0, v_next.items_subtotal_idr - v_next.discount_idr + v_next.delivery_fee_idr) then
    raise exception 'ORDER_TOTAL_MISMATCH' using errcode = '22023';
  end if;
  if v_next.paid_amount_idr is null or v_next.paid_amount_idr < 0 or v_next.paid_amount_idr > v_next.total_idr then
    raise exception 'INVALID_PAID_AMOUNT' using errcode = '22023';
  end if;

  -- Canonicalize and validate line items. The item payload must always be a
  -- complete snapshot; this lets details/item edits share the same revision.
  select count(*), coalesce(sum(x.quantity::bigint * x.unit_price_idr), 0)
  into v_item_count, v_item_subtotal
  from jsonb_to_recordset(p_items) as x(
    id text,
    product_id text,
    variant_id text,
    product_code_snapshot text,
    product_name_snapshot text,
    variant_sku_snapshot text,
    variant_size_snapshot text,
    quantity integer,
    unit_price_idr bigint
  );

  if v_item_count < 1 then
    raise exception 'ORDER_ITEMS_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(
      id text,
      product_id text,
      variant_id text,
      product_code_snapshot text,
      product_name_snapshot text,
      variant_sku_snapshot text,
      variant_size_snapshot text,
      quantity integer,
      unit_price_idr bigint
    )
    where nullif(trim(x.id), '') is null
       or nullif(trim(x.product_name_snapshot), '') is null
       or x.quantity is null or x.quantity <= 0
       or x.unit_price_idr is null or x.unit_price_idr < 0
  ) then
    raise exception 'INVALID_ORDER_ITEM' using errcode = '22023';
  end if;
  if (
    select count(*)
    from jsonb_to_recordset(p_items) as x(id text)
  ) <> (
    select count(distinct x.id)
    from jsonb_to_recordset(p_items) as x(id text)
  ) then
    raise exception 'DUPLICATE_ORDER_ITEM_ID' using errcode = '22023';
  end if;
  if v_item_subtotal <> v_next.items_subtotal_idr then
    raise exception 'ORDER_ITEM_SUBTOTAL_MISMATCH' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.order_items oi
    join jsonb_to_recordset(p_items) as x(id text) on x.id = oi.id
    where oi.order_id <> p_order_id
  ) then
    raise exception 'ORDER_ITEM_ID_OWNED_BY_OTHER_ORDER' using errcode = '23505';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
  into v_requested_items
  from jsonb_to_recordset(p_items) as x(
    id text,
    product_id text,
    variant_id text,
    product_code_snapshot text,
    product_name_snapshot text,
    variant_sku_snapshot text,
    variant_size_snapshot text,
    quantity integer,
    unit_price_idr bigint
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', oi.id,
    'product_id', oi.product_id,
    'variant_id', oi.variant_id,
    'product_code_snapshot', oi.product_code_snapshot,
    'product_name_snapshot', oi.product_name_snapshot,
    'variant_sku_snapshot', oi.variant_sku_snapshot,
    'variant_size_snapshot', oi.variant_size_snapshot,
    'quantity', oi.quantity,
    'unit_price_idr', oi.unit_price_idr
  ) order by oi.id), '[]'::jsonb)
  into v_current_items
  from public.order_items oi
  where oi.order_id = p_order_id;

  -- Payment history is append-only. Existing entries must be supplied
  -- unchanged, and new idempotency keys may not belong to another order.
  if (
    select count(*)
    from jsonb_to_recordset(p_payment_events) as x(idempotency_key text)
  ) <> (
    select count(distinct x.idempotency_key)
    from jsonb_to_recordset(p_payment_events) as x(idempotency_key text)
  ) then
    raise exception 'DUPLICATE_PAYMENT_EVENT_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_payment_events) as x(
      id text,
      type text,
      amount_idr bigint,
      previous_paid_amount_idr bigint,
      resulting_paid_amount_idr bigint,
      resulting_status text,
      method text,
      reference text,
      proof_id text,
      note text,
      occurred_at timestamptz,
      idempotency_key text,
      ledger_transaction_id text
    )
    where nullif(trim(x.id), '') is null
       or nullif(trim(x.idempotency_key), '') is null
       or x.type not in (
         'payment_received','payment_reversed','payment_status_adjusted',
         'refund_initiated','refund_completed','refund_cancelled'
       )
       or x.amount_idr is null or x.amount_idr < 0
       or x.previous_paid_amount_idr is null or x.previous_paid_amount_idr < 0
       or x.resulting_paid_amount_idr is null or x.resulting_paid_amount_idr < 0
       or x.resulting_status not in ('unpaid','partial','paid','refund_pending','refunded')
       or (x.method is not null and x.method not in ('cash','transfer'))
       or x.occurred_at is null
  ) then
    raise exception 'INVALID_PAYMENT_EVENT' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.order_payment_events ope
    join jsonb_to_recordset(p_payment_events) as x(idempotency_key text)
      on x.idempotency_key = ope.idempotency_key
    where ope.order_id <> p_order_id
  ) then
    raise exception 'PAYMENT_EVENT_OWNED_BY_OTHER_ORDER' using errcode = '23505';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ope.id,
    'type', ope.type,
    'amount_idr', ope.amount_idr,
    'previous_paid_amount_idr', ope.previous_paid_amount_idr,
    'resulting_paid_amount_idr', ope.resulting_paid_amount_idr,
    'resulting_status', ope.resulting_status,
    'method', ope.method,
    'reference', ope.reference,
    'proof_id', ope.proof_id,
    'note', ope.note,
    'occurred_at', ope.occurred_at,
    'idempotency_key', ope.idempotency_key,
    'ledger_transaction_id', ope.ledger_transaction_id
  ) order by ope.occurred_at, ope.id), '[]'::jsonb)
  into v_current_payment_events
  from public.order_payment_events ope
  where ope.order_id = p_order_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at, x.id), '[]'::jsonb)
  into v_requested_payment_events
  from jsonb_to_recordset(p_payment_events) as x(
    id text,
    type text,
    amount_idr bigint,
    previous_paid_amount_idr bigint,
    resulting_paid_amount_idr bigint,
    resulting_status text,
    method text,
    reference text,
    proof_id text,
    note text,
    occurred_at timestamptz,
    idempotency_key text,
    ledger_transaction_id text
  );

  -- Prove that no stored ledger event was removed or altered.
  if exists (
    select 1
    from public.order_payment_events ope
    where ope.order_id = p_order_id
      and not exists (
        select 1
        from jsonb_to_recordset(p_payment_events) as x(
          id text,
          type text,
          amount_idr bigint,
          previous_paid_amount_idr bigint,
          resulting_paid_amount_idr bigint,
          resulting_status text,
          method text,
          reference text,
          proof_id text,
          note text,
          occurred_at timestamptz,
          idempotency_key text,
          ledger_transaction_id text
        )
        where x.idempotency_key = ope.idempotency_key
          and x.id = ope.id
          and x.type = ope.type
          and x.amount_idr = ope.amount_idr
          and x.previous_paid_amount_idr = ope.previous_paid_amount_idr
          and x.resulting_paid_amount_idr = ope.resulting_paid_amount_idr
          and x.resulting_status = ope.resulting_status
          and x.method is not distinct from ope.method
          and x.reference is not distinct from ope.reference
          and x.proof_id is not distinct from ope.proof_id
          and x.note is not distinct from ope.note
          and x.occurred_at = ope.occurred_at
          and x.ledger_transaction_id is not distinct from ope.ledger_transaction_id
      )
  ) then
    raise exception 'PAYMENT_HISTORY_IS_APPEND_ONLY' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at, x.id), '[]'::jsonb)
  into v_new_payment_events
  from jsonb_to_recordset(p_payment_events) as x(
    id text,
    type text,
    amount_idr bigint,
    previous_paid_amount_idr bigint,
    resulting_paid_amount_idr bigint,
    resulting_status text,
    method text,
    reference text,
    proof_id text,
    note text,
    occurred_at timestamptz,
    idempotency_key text,
    ledger_transaction_id text
  )
  where not exists (
    select 1
    from public.order_payment_events ope
    where ope.idempotency_key = x.idempotency_key
  );

  v_locked := v_order.status in ('delivered','picked_up') and not v_order.edit_unlocked;
  v_finished := v_order.status in ('delivered','picked_up');

  v_details_changed :=
    v_requested_items is distinct from v_current_items
    or v_next.customer_id is distinct from v_order.customer_id
    or v_next.customer_name_snapshot is distinct from v_order.customer_name_snapshot
    or v_next.customer_whatsapp_snapshot is distinct from v_order.customer_whatsapp_snapshot
    or v_next.customer_email_snapshot is distinct from v_order.customer_email_snapshot
    or v_next.customer_profile_suggestions is distinct from v_order.customer_profile_suggestions
    or v_next.source is distinct from v_order.source
    or v_next.fulfillment is distinct from v_order.fulfillment
    or v_next.total_idr is distinct from v_order.total_idr
    or v_next.items_subtotal_idr is distinct from v_order.items_subtotal_idr
    or v_next.discount_idr is distinct from v_order.discount_idr
    or v_next.delivery_fee_idr is distinct from v_order.delivery_fee_idr
    or v_next.schedule_label is distinct from v_order.schedule_label
    or v_next.schedule_date is distinct from v_order.schedule_date
    or v_next.schedule_time is distinct from v_order.schedule_time
    or v_next.requested_pickup_date is distinct from v_order.requested_pickup_date
    or v_next.requested_pickup_time is distinct from v_order.requested_pickup_time
    or v_next.order_note is distinct from v_order.order_note
    or v_next.greeting_message is distinct from v_order.greeting_message
    or v_next.greeting_card_name is distinct from v_order.greeting_card_name
    or v_next.delivery_address is distinct from v_order.delivery_address
    or v_next.delivery_instructions is distinct from v_order.delivery_instructions
    or v_next.promo_code is distinct from v_order.promo_code;

  v_assignment_changed :=
    v_next.florist_display_name is distinct from v_order.florist_display_name
    or v_next.florist_assigned_employee_id is distinct from v_order.florist_assigned_employee_id
    or v_next.florist_assigned_at is distinct from v_order.florist_assigned_at
    or v_next.florist_assigned_for_date is distinct from v_order.florist_assigned_for_date
    or v_next.florist_assigned_for_time is distinct from v_order.florist_assigned_for_time
    or v_next.florist_assigned_by_employee_id is distinct from v_order.florist_assigned_by_employee_id
    or v_next.florist_assigned_by_name is distinct from v_order.florist_assigned_by_name
    or v_next.florist_schedule_override is distinct from v_order.florist_schedule_override
    or v_next.florist_schedule_override_reason is distinct from v_order.florist_schedule_override_reason
    or v_next.florist_scheduled_branch_id is distinct from v_order.florist_scheduled_branch_id
    or v_next.florist_assigned_branch_id is distinct from v_order.florist_assigned_branch_id
    or v_next.florist_scheduled_shift_start is distinct from v_order.florist_scheduled_shift_start
    or v_next.florist_scheduled_shift_end is distinct from v_order.florist_scheduled_shift_end
    or v_next.processing_started_at is distinct from v_order.processing_started_at
    or v_next.admin_handled_employee_id is distinct from v_order.admin_handled_employee_id
    or v_next.admin_handled_by_name is distinct from v_order.admin_handled_by_name;

  v_status_changed :=
    v_next.status is distinct from v_order.status
    or v_next.completed_at is distinct from v_order.completed_at
    or v_next.actual_picked_up_at is distinct from v_order.actual_picked_up_at;

  v_payment_changed :=
    v_next.payment_status is distinct from v_order.payment_status
    or v_next.payment_method is distinct from v_order.payment_method
    or v_next.paid_amount_idr is distinct from v_order.paid_amount_idr
    or v_new_payment_events <> '[]'::jsonb;

  v_refund_changed :=
    v_next.refund_amount_idr is distinct from v_order.refund_amount_idr
    or v_next.refund_reason is distinct from v_order.refund_reason
    or v_next.refund_initiated_by is distinct from v_order.refund_initiated_by
    or v_next.refund_initiated_at is distinct from v_order.refund_initiated_at
    or v_next.refund_completed_by is distinct from v_order.refund_completed_by
    or v_next.refund_completed_at is distinct from v_order.refund_completed_at
    or v_next.refund_cancelled_by is distinct from v_order.refund_cancelled_by
    or v_next.refund_cancelled_at is distinct from v_order.refund_cancelled_at
    or v_next.refund_cancellation_reason is distinct from v_order.refund_cancellation_reason;

  v_finance_changed :=
    v_next.finance_verified is distinct from v_order.finance_verified
    or v_next.finance_verified_by is distinct from v_order.finance_verified_by
    or v_next.finance_verified_at is distinct from v_order.finance_verified_at
    or v_next.finance_verification_status is distinct from v_order.finance_verification_status
    or v_next.finance_verification_note is distinct from v_order.finance_verification_note
    or v_next.finance_verification_actor is distinct from v_order.finance_verification_actor
    or v_next.finance_verification_at is distinct from v_order.finance_verification_at;

  v_change_control_changed :=
    v_next.pending_change_request is distinct from v_order.pending_change_request
    or v_next.edit_unlocked is distinct from v_order.edit_unlocked
    or v_next.finance_resubmitted_by is distinct from v_order.finance_resubmitted_by
    or v_next.finance_resubmitted_at is distinct from v_order.finance_resubmitted_at
    or v_next.finance_resubmission_note is distinct from v_order.finance_resubmission_note
    or v_next.finance_submission_revision is distinct from v_order.finance_submission_revision;

  v_submitted_change_request := v_order.pending_change_request is null and v_next.pending_change_request is not null;
  v_resolved_change_request := v_order.pending_change_request is not null and v_next.pending_change_request is null;
  v_finalizing_unlocked_edit := v_order.edit_unlocked and not v_next.edit_unlocked;
  v_resubmission :=
    v_order.finance_verification_status = 'rejected'
    and v_next.finance_verification_status is null
    and v_next.finance_resubmitted_at is not null
    and v_next.finance_resubmitted_at is distinct from v_order.finance_resubmitted_at;

  -- Active/unlocked operational edits: Owner/Admin. Locked edits: Finance.
  if (v_details_changed or v_assignment_changed or v_status_changed or v_payment_changed) then
    if v_locked then
      if v_profile.role <> 'finance' then
        -- Submitting/resolving a locked change request may also alter status or
        -- edit_unlocked; those special transitions are checked below.
        if not (v_resolved_change_request and v_next.status = 'cancelled')
          and not (v_resolved_change_request and v_next.edit_unlocked)
        then
          raise exception 'ORDER_LOCKED_FINANCE_REVIEW_REQUIRED' using errcode = '42501';
        end if;
      end if;
    elsif v_profile.role = 'florist' then
      if not v_status_changed
        or v_details_changed
        or v_payment_changed
        or v_refund_changed
        or v_finance_changed
        or v_change_control_changed
        or v_order.florist_assigned_employee_id is distinct from v_profile.employee_id
        or v_next.florist_display_name is distinct from v_order.florist_display_name
        or v_next.florist_assigned_employee_id is distinct from v_order.florist_assigned_employee_id
        or v_next.florist_assigned_at is distinct from v_order.florist_assigned_at
        or v_next.florist_assigned_for_date is distinct from v_order.florist_assigned_for_date
        or v_next.florist_assigned_for_time is distinct from v_order.florist_assigned_for_time
        or v_next.florist_assigned_by_employee_id is distinct from v_order.florist_assigned_by_employee_id
        or v_next.florist_assigned_by_name is distinct from v_order.florist_assigned_by_name
        or v_next.florist_schedule_override is distinct from v_order.florist_schedule_override
        or v_next.florist_schedule_override_reason is distinct from v_order.florist_schedule_override_reason
        or v_next.florist_scheduled_branch_id is distinct from v_order.florist_scheduled_branch_id
        or v_next.florist_assigned_branch_id is distinct from v_order.florist_assigned_branch_id
        or v_next.florist_scheduled_shift_start is distinct from v_order.florist_scheduled_shift_start
        or v_next.florist_scheduled_shift_end is distinct from v_order.florist_scheduled_shift_end
        or v_next.admin_handled_employee_id is distinct from v_order.admin_handled_employee_id
        or v_next.admin_handled_by_name is distinct from v_order.admin_handled_by_name
      then
        raise exception 'FLORIST_STATUS_ONLY' using errcode = '42501';
      end if;
    elsif v_profile.role not in ('owner','admin') then
      raise exception 'FINANCE_GENERAL_ORDERS_READ_ONLY' using errcode = '42501';
    end if;
  end if;

  -- Normal status changes follow the fulfillment pipeline. One-step backward
  -- is allowed for the app's exact Undo path; terminal exception states never
  -- become mutable again.
  if v_next.status is distinct from v_order.status then
    if v_profile.role = 'florist' then
      if v_order.florist_assigned_employee_id is distinct from v_profile.employee_id then
        raise exception 'FLORIST_ORDER_ASSIGNMENT_REQUIRED' using errcode = '42501';
      end if;
      if not (
        (v_order.status = 'confirmed' and v_next.status = 'processing')
        or (v_order.status = 'processing' and v_next.status = 'ready')
        or (v_order.status = 'ready' and v_next.status = 'processing')
      ) then
        raise exception 'FLORIST_PRODUCTION_STATUS_ONLY' using errcode = '42501';
      end if;
    end if;
    if v_order.status in ('cancelled','failed') then
      raise exception 'TERMINAL_ORDER_IMMUTABLE' using errcode = '42501';
    end if;

    if v_locked and v_next.status <> 'cancelled' then
      raise exception 'LOCKED_ORDER_STATUS_REQUIRES_CANCELLATION_FLOW' using errcode = '42501';
    end if;

    if v_resolved_change_request and v_next.status = 'cancelled' then
      if v_profile.role not in ('owner','finance')
        or coalesce(v_order.pending_change_request->>'type', '') <> 'cancel'
        or not v_finished
      then
        raise exception 'INVALID_CANCELLATION_APPROVAL' using errcode = '42501';
      end if;
    elsif v_next.status = 'cancelled' then
      if v_locked and v_profile.role <> 'finance' then
        raise exception 'LOCKED_CANCELLATION_REQUIRES_APPROVAL' using errcode = '42501';
      end if;
    elsif v_next.status = 'failed' then
      if v_finished then
        raise exception 'FINISHED_ORDER_CANNOT_FAIL' using errcode = '22023';
      end if;
    else
      v_pipeline := case v_order.fulfillment
        when 'delivery' then array['pending_verification','confirmed','processing','ready','delivering','delivered']::text[]
        else array['pending_verification','confirmed','processing','ready','picked_up']::text[]
      end;
      v_current_status_index := array_position(v_pipeline, v_order.status);
      v_next_status_index := array_position(v_pipeline, v_next.status);
      if v_current_status_index is null or v_next_status_index is null
        or abs(v_next_status_index - v_current_status_index) <> 1
      then
        raise exception 'ILLEGAL_ORDER_STATUS_TRANSITION' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Outstanding balances cannot advance to courier handoff / pickup.
  if v_next.status in ('delivering','picked_up')
    and v_next.payment_status in ('unpaid','partial')
  then
    raise exception 'OUTSTANDING_PAYMENT_BLOCKS_FULFILLMENT' using errcode = '22023';
  end if;

  -- Change-request lifecycle is explicit and server-authorized.
  if v_submitted_change_request then
    v_request_type := coalesce(v_next.pending_change_request->>'type', '');
    v_request_reason := nullif(trim(coalesce(v_next.pending_change_request->>'reason', '')), '');
    if v_profile.role not in ('owner','admin') or not v_locked then
      raise exception 'CHANGE_REQUEST_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_request_type not in ('edit','cancel') or v_request_reason is null then
      raise exception 'INVALID_CHANGE_REQUEST' using errcode = '22023';
    end if;
  elsif v_order.pending_change_request is not null
    and v_next.pending_change_request is not null
    and v_next.pending_change_request is distinct from v_order.pending_change_request
  then
    raise exception 'PENDING_CHANGE_REQUEST_IMMUTABLE' using errcode = '42501';
  end if;

  if v_resolved_change_request then
    if v_profile.role not in ('owner','finance') then
      raise exception 'CHANGE_REQUEST_RESOLUTION_NOT_PERMITTED' using errcode = '42501';
    end if;
    v_request_type := coalesce(v_order.pending_change_request->>'type', '');
    if v_next.edit_unlocked and v_request_type <> 'edit' then
      raise exception 'EDIT_UNLOCK_REQUIRES_EDIT_REQUEST' using errcode = '22023';
    end if;
    if v_next.status = 'cancelled' and v_request_type <> 'cancel' then
      raise exception 'CANCEL_REQUIRES_CANCELLATION_REQUEST' using errcode = '22023';
    end if;
  end if;

  -- No caller may toggle edit/change-control metadata as an arbitrary JSON
  -- patch. Every allowed shape must correspond to one explicit workflow.
  if not v_order.edit_unlocked and v_next.edit_unlocked then
    if not (
      (v_resolved_change_request and coalesce(v_order.pending_change_request->>'type', '') = 'edit')
      or (v_profile.role in ('owner','finance') and v_next.finance_verification_status = 'rejected')
    ) then
      raise exception 'EDIT_UNLOCK_NOT_PERMITTED' using errcode = '42501';
    end if;
  end if;

  if (
    v_next.finance_resubmitted_by is distinct from v_order.finance_resubmitted_by
    or v_next.finance_resubmitted_at is distinct from v_order.finance_resubmitted_at
    or v_next.finance_resubmission_note is distinct from v_order.finance_resubmission_note
    or v_next.finance_submission_revision is distinct from v_order.finance_submission_revision
  ) and not v_resubmission then
    raise exception 'FINANCE_RESUBMISSION_METADATA_NOT_PERMITTED' using errcode = '42501';
  end if;

  -- An unlocked edit is consumed exactly once by Admin/Owner. It must re-lock
  -- and, if Finance had already verified it, clear the stale verification.
  if v_finalizing_unlocked_edit then
    if v_profile.role not in ('owner','admin') then
      raise exception 'EDIT_FINALIZATION_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_order.finance_verified then
      if v_next.finance_verified
        or v_next.finance_verified_by is not null
        or v_next.finance_verified_at is not null
      then
        raise exception 'EDIT_MUST_RESET_FINANCE_VERIFICATION' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Finance decision fields are Finance/Owner-only except for the exact
  -- Admin/Owner resubmission/reset paths produced by the application domain.
  if v_finance_changed then
    if v_resubmission then
      if v_profile.role not in ('owner','admin') or not v_finished then
        raise exception 'FINANCE_RESUBMIT_NOT_PERMITTED' using errcode = '42501';
      end if;
      if nullif(trim(coalesce(v_next.finance_resubmission_note, '')), '') is null then
        raise exception 'FINANCE_RESUBMISSION_NOTE_REQUIRED' using errcode = '22023';
      end if;
    elsif v_finalizing_unlocked_edit and v_profile.role in ('owner','admin') then
      -- Covered by the one-time edit finalization check above.
      null;
    elsif v_profile.role not in ('owner','finance') then
      raise exception 'FINANCE_FIELDS_REQUIRE_FINANCE_OR_OWNER' using errcode = '42501';
    end if;
  end if;

  if v_next.finance_verified then
    if v_profile.role not in ('owner','finance') then
      raise exception 'FINANCE_VERIFICATION_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_next.status not in ('delivered','picked_up') then
      raise exception 'ORDER_NOT_FINISHED_FOR_VERIFICATION' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(v_next.finance_verified_by, '')), '') is null
      or v_next.finance_verified_at is null
    then
      raise exception 'FINANCE_VERIFICATION_EVIDENCE_REQUIRED' using errcode = '22023';
    end if;
  end if;

  if v_next.finance_verification_status in ('rejected','review') then
    if v_profile.role not in ('owner','finance') or not v_finished then
      raise exception 'FINANCE_DECISION_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_next.finance_verification_status = 'rejected'
      and nullif(trim(coalesce(v_next.finance_verification_note, '')), '') is null
    then
      raise exception 'FINANCE_REJECTION_NOTE_REQUIRED' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(v_next.finance_verification_actor, '')), '') is null
      or v_next.finance_verification_at is null
    then
      raise exception 'FINANCE_DECISION_EVIDENCE_REQUIRED' using errcode = '22023';
    end if;
  end if;

  -- Refund state is Owner/Finance-only; completion itself is Finance-only.
  if v_refund_changed then
    if v_profile.role not in ('owner','finance') then
      raise exception 'REFUND_NOT_PERMITTED' using errcode = '42501';
    end if;
    if v_next.refund_completed_at is distinct from v_order.refund_completed_at
      and v_next.refund_completed_at is not null
      and v_profile.role <> 'finance'
    then
      raise exception 'REFUND_COMPLETION_REQUIRES_FINANCE' using errcode = '42501';
    end if;
  end if;

  -- New payment events are authoritative append-only ledger entries. Their
  -- role and aggregate result must agree with the resulting Order state.
  if v_new_payment_events <> '[]'::jsonb then
    for v_event in select value from jsonb_array_elements(v_new_payment_events)
    loop
      v_event_type := v_event->>'type';
      if v_event_type = 'refund_completed' and v_profile.role <> 'finance' then
        raise exception 'REFUND_COMPLETION_REQUIRES_FINANCE' using errcode = '42501';
      end if;
      if v_event_type in ('refund_initiated','refund_cancelled','refund_completed')
        and v_profile.role not in ('owner','finance')
      then
        raise exception 'REFUND_EVENT_NOT_PERMITTED' using errcode = '42501';
      end if;
      if v_event_type in ('payment_received','payment_reversed','payment_status_adjusted') then
        if v_locked and v_profile.role <> 'finance' then
          raise exception 'LOCKED_PAYMENT_REQUIRES_FINANCE' using errcode = '42501';
        elsif not v_locked and v_profile.role not in ('owner','admin') then
          raise exception 'PAYMENT_EVENT_NOT_PERMITTED' using errcode = '42501';
        end if;
      end if;
      v_last_new_event := v_event;
    end loop;

    if (v_last_new_event->>'resulting_paid_amount_idr')::bigint <> v_next.paid_amount_idr
      or v_last_new_event->>'resulting_status' <> v_next.payment_status
    then
      raise exception 'PAYMENT_EVENT_AGGREGATE_MISMATCH' using errcode = '22023';
    end if;
  elsif v_next.payment_status is distinct from v_order.payment_status
    or v_next.paid_amount_idr is distinct from v_order.paid_amount_idr
  then
    raise exception 'PAYMENT_CHANGE_REQUIRES_LEDGER_EVENT' using errcode = '22023';
  end if;

  v_before := to_jsonb(v_order);

  -- Keep item ids order-scoped and write the complete desired snapshot.
  insert into public.order_items (
    id, order_id, product_id, variant_id, product_code_snapshot,
    product_name_snapshot, variant_sku_snapshot, variant_size_snapshot,
    quantity, unit_price_idr
  )
  select
    x.id, p_order_id, x.product_id, x.variant_id, x.product_code_snapshot,
    x.product_name_snapshot, x.variant_sku_snapshot, x.variant_size_snapshot,
    x.quantity, x.unit_price_idr
  from jsonb_to_recordset(p_items) as x(
    id text,
    product_id text,
    variant_id text,
    product_code_snapshot text,
    product_name_snapshot text,
    variant_sku_snapshot text,
    variant_size_snapshot text,
    quantity integer,
    unit_price_idr bigint
  )
  on conflict (id) do update set
    product_id = excluded.product_id,
    variant_id = excluded.variant_id,
    product_code_snapshot = excluded.product_code_snapshot,
    product_name_snapshot = excluded.product_name_snapshot,
    variant_sku_snapshot = excluded.variant_sku_snapshot,
    variant_size_snapshot = excluded.variant_size_snapshot,
    quantity = excluded.quantity,
    unit_price_idr = excluded.unit_price_idr
  where public.order_items.order_id = p_order_id;

  delete from public.order_items oi
  where oi.order_id = p_order_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_items) as x(id text)
      where x.id = oi.id
    );

  -- New payment entries are written with the authenticated staff identity;
  -- actor identity is never trusted from browser JSON.
  insert into public.order_payment_events (
    id, order_id, type, amount_idr, previous_paid_amount_idr,
    resulting_paid_amount_idr, resulting_status, method, reference, proof_id,
    note, actor_id, actor_name, occurred_at, idempotency_key,
    ledger_transaction_id
  )
  select
    x.id,
    p_order_id,
    x.type,
    x.amount_idr,
    x.previous_paid_amount_idr,
    x.resulting_paid_amount_idr,
    x.resulting_status,
    x.method,
    x.reference,
    x.proof_id,
    x.note,
    v_profile.employee_id,
    v_actor_name,
    x.occurred_at,
    x.idempotency_key,
    x.ledger_transaction_id
  from jsonb_to_recordset(p_payment_events) as x(
    id text,
    type text,
    amount_idr bigint,
    previous_paid_amount_idr bigint,
    resulting_paid_amount_idr bigint,
    resulting_status text,
    method text,
    reference text,
    proof_id text,
    note text,
    occurred_at timestamptz,
    idempotency_key text,
    ledger_transaction_id text
  )
  where not exists (
    select 1 from public.order_payment_events ope
    where ope.idempotency_key = x.idempotency_key
  );

  update public.orders
  set
    customer_id = v_next.customer_id,
    customer_name_snapshot = v_next.customer_name_snapshot,
    customer_whatsapp_snapshot = v_next.customer_whatsapp_snapshot,
    customer_email_snapshot = v_next.customer_email_snapshot,
    customer_profile_suggestions = v_next.customer_profile_suggestions,
    source = v_next.source,
    fulfillment = v_next.fulfillment,
    status = v_next.status,
    total_idr = v_next.total_idr,
    items_subtotal_idr = v_next.items_subtotal_idr,
    discount_idr = v_next.discount_idr,
    delivery_fee_idr = v_next.delivery_fee_idr,
    payment_status = v_next.payment_status,
    payment_method = v_next.payment_method,
    paid_amount_idr = v_next.paid_amount_idr,
    refund_amount_idr = v_next.refund_amount_idr,
    refund_reason = v_next.refund_reason,
    refund_initiated_by = v_next.refund_initiated_by,
    refund_initiated_at = v_next.refund_initiated_at,
    refund_completed_by = v_next.refund_completed_by,
    refund_completed_at = v_next.refund_completed_at,
    refund_cancelled_by = v_next.refund_cancelled_by,
    refund_cancelled_at = v_next.refund_cancelled_at,
    refund_cancellation_reason = v_next.refund_cancellation_reason,
    schedule_label = v_next.schedule_label,
    schedule_date = v_next.schedule_date,
    schedule_time = v_next.schedule_time,
    requested_pickup_date = v_next.requested_pickup_date,
    requested_pickup_time = v_next.requested_pickup_time,
    actual_picked_up_at = v_next.actual_picked_up_at,
    order_note = v_next.order_note,
    greeting_message = v_next.greeting_message,
    greeting_card_name = v_next.greeting_card_name,
    delivery_address = v_next.delivery_address,
    delivery_instructions = v_next.delivery_instructions,
    promo_code = v_next.promo_code,
    florist_display_name = v_next.florist_display_name,
    florist_assigned_employee_id = v_next.florist_assigned_employee_id,
    florist_assigned_at = v_next.florist_assigned_at,
    florist_assigned_for_date = v_next.florist_assigned_for_date,
    florist_assigned_for_time = v_next.florist_assigned_for_time,
    florist_assigned_by_employee_id = v_next.florist_assigned_by_employee_id,
    florist_assigned_by_name = v_next.florist_assigned_by_name,
    florist_schedule_override = v_next.florist_schedule_override,
    florist_schedule_override_reason = v_next.florist_schedule_override_reason,
    florist_scheduled_branch_id = v_next.florist_scheduled_branch_id,
    florist_assigned_branch_id = v_next.florist_assigned_branch_id,
    florist_scheduled_shift_start = v_next.florist_scheduled_shift_start,
    florist_scheduled_shift_end = v_next.florist_scheduled_shift_end,
    processing_started_at = v_next.processing_started_at,
    admin_handled_employee_id = v_next.admin_handled_employee_id,
    admin_handled_by_name = v_next.admin_handled_by_name,
    completed_at = v_next.completed_at,
    finance_verified = v_next.finance_verified,
    finance_verified_by = v_next.finance_verified_by,
    finance_verified_at = v_next.finance_verified_at,
    finance_verification_status = v_next.finance_verification_status,
    finance_verification_note = v_next.finance_verification_note,
    finance_verification_actor = v_next.finance_verification_actor,
    finance_verification_at = v_next.finance_verification_at,
    finance_resubmitted_by = v_next.finance_resubmitted_by,
    finance_resubmitted_at = v_next.finance_resubmitted_at,
    finance_resubmission_note = v_next.finance_resubmission_note,
    finance_submission_revision = v_next.finance_submission_revision,
    pending_change_request = v_next.pending_change_request,
    edit_unlocked = v_next.edit_unlocked,
    revision = p_next_revision
  where id = p_order_id
    and revision = p_expected_revision
  returning * into v_next;

  if not found then
    raise exception 'REVISION_CONFLICT:order:%:lost_update', p_order_id using errcode = '40001';
  end if;

  -- trg_orders_bump_revision is authoritative; assert that the mutation
  -- advanced exactly the revision the caller expected.
  if v_next.revision <> p_next_revision then
    raise exception 'ORDER_REVISION_TRIGGER_MISMATCH' using errcode = '40001';
  end if;

  v_after := to_jsonb(v_next);
  perform private.write_audit_event(
    'order.operational.save',
    'order',
    p_order_id,
    'succeeded',
    p_expected_revision,
    v_next.revision,
    v_before,
    v_after,
    jsonb_build_object(
      'detailsChanged', v_details_changed,
      'assignmentChanged', v_assignment_changed,
      'statusChanged', v_status_changed,
      'paymentChanged', v_payment_changed,
      'refundChanged', v_refund_changed,
      'financeChanged', v_finance_changed,
      'changeControlChanged', v_change_control_changed
    )
  );

  return jsonb_build_object(
    'id', v_next.id,
    'revision', v_next.revision,
    'updatedAt', v_next.updated_at
  );
end;
$$;


revoke execute on function public.save_order_operational_state_v31_internal(text,integer,integer,jsonb,jsonb,jsonb) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Internal Order quote: same authoritative branch/catalog/voucher rules used
-- by final creation, without creating Customer/Order side effects.
-- ---------------------------------------------------------------------------
create or replace function public.quote_internal_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype;
  v_customer_json jsonb:=coalesce(p_payload->'customer','{}'::jsonb);
  v_branch public.branches%rowtype;
  v_items jsonb:=coalesce(p_payload->'items','[]'::jsonb);
  v_quote_items jsonb:='[]'::jsonb;
  v_item jsonb; v_product public.products%rowtype; v_variant public.product_variants%rowtype;
  v_qty integer; v_unit bigint; v_subtotal bigint:=0; v_delivery bigint:=0; v_discount bigint:=0;
  v_fulfillment text:=p_payload->>'fulfillment'; v_payment_method text:=nullif(p_payload->>'paymentMethod','');
  v_schedule_date date; v_schedule_time time; v_day_key text; v_hours jsonb; v_quote jsonb; v_promo jsonb;
begin
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1;
  if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  if not private.has_action_permission('orders.create') then raise exception 'ORDER_CREATE_PERMISSION_REQUIRED' using errcode='42501'; end if;
  if coalesce(p_payload->>'source','') not in ('whatsapp','walk_in') then raise exception 'INVALID_INTERNAL_ORDER_SOURCE' using errcode='22023'; end if;
  if v_fulfillment not in ('delivery','pickup') then raise exception 'INVALID_FULFILLMENT' using errcode='22023'; end if;
  select * into v_branch from public.branches where id=p_payload->>'branchId' and is_active=true;
  if not found then raise exception 'Selected branch is unavailable.' using errcode='22023'; end if;
  if v_profile.role='admin' and private.current_staff_branch_id() is distinct from v_branch.id then raise exception 'ADMIN_BRANCH_SCOPE_REQUIRED' using errcode='42501'; end if;
  if v_payment_method not in ('transfer','cash') then raise exception 'INVALID_PAYMENT_METHOD' using errcode='22023'; end if;
  if v_fulfillment='delivery' and v_payment_method='cash' then raise exception 'Cash payment is only available for pickup orders.' using errcode='22023'; end if;
  if v_fulfillment='delivery' and nullif(trim(coalesce(p_payload->>'deliveryAddress','')),'') is null then raise exception 'Delivery address is required.' using errcode='22023'; end if;
  v_schedule_date:=nullif(p_payload->>'scheduleDate','')::date; v_schedule_time:=nullif(p_payload->>'scheduleTime','')::time;
  if v_schedule_date is null or v_schedule_time is null then raise exception 'Schedule date and time are required.' using errcode='22023'; end if;
  if v_schedule_date < timezone('Asia/Jakarta',now())::date then raise exception 'Schedule date cannot be in the past.' using errcode='22023'; end if;
  v_day_key:=lower(trim(to_char(v_schedule_date,'FMDay'))); v_hours:=v_branch.opening_hours->v_day_key;
  if v_hours is null or coalesce((v_hours->>'isOpen')::boolean,false)=false then raise exception 'Selected branch is closed on this date.' using errcode='22023'; end if;
  if v_schedule_time < (v_hours->>'opensAt')::time or v_schedule_time > (v_hours->>'closesAt')::time then raise exception 'Selected time is outside branch opening hours.' using errcode='22023'; end if;
  if v_payment_method='transfer' and not exists (select 1 from public.public_payment_accounts a where a.is_active=true and a.is_customer_visible=true and (cardinality(a.branch_ids)=0 or v_branch.id=any(a.branch_ids))) then raise exception 'Bank transfer is unavailable for this branch.' using errcode='22023'; end if;
  if nullif(trim(v_customer_json->>'name'),'') is null or length(private.normalize_whatsapp(v_customer_json->>'whatsappNumber'))<8 then raise exception 'VALID_CUSTOMER_REQUIRED' using errcode='22023'; end if;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)<1 or jsonb_array_length(v_items)>20 then raise exception 'ORDER_ITEMS_REQUIRED' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty:=coalesce((v_item->>'quantity')::integer,0); if v_qty<1 or v_qty>99 then raise exception 'Item quantity must be between 1 and 99.' using errcode='22023'; end if;
    if coalesce(v_item->>'mode','catalog')='catalog' then
      select * into v_product from public.products where id=v_item->>'productId' and is_active=true; if not found then raise exception 'A selected product is unavailable.' using errcode='22023'; end if;
      select * into v_variant from public.product_variants where id=v_item->>'variantId' and product_id=v_product.id and status='active'; if not found then raise exception 'A selected product variant is unavailable.' using errcode='22023'; end if;
      v_unit:=v_variant.price_idr; v_quote_items:=v_quote_items||jsonb_build_array(jsonb_build_object('productId',v_product.id,'variantId',v_variant.id,'quantity',v_qty));
    else
      v_unit:=coalesce((v_item->>'unitPriceIdr')::bigint,0); if v_unit<=0 then raise exception 'CUSTOM_ITEM_PRICE_REQUIRED' using errcode='22023'; end if;
      if nullif(trim(v_item->>'productName'),'') is null then raise exception 'CUSTOM_ITEM_NAME_REQUIRED' using errcode='22023'; end if;
    end if;
    v_subtotal:=v_subtotal+v_unit*v_qty;
  end loop;
  if jsonb_array_length(v_quote_items)=jsonb_array_length(v_items) then
    v_quote:=private.resolve_checkout_quote(v_customer_json,v_branch.id,v_fulfillment,v_schedule_date,v_schedule_time,v_quote_items,coalesce(v_payment_method,'transfer'),p_payload->>'promoCode');
    return v_quote;
  end if;
  v_delivery:=case when v_fulfillment='delivery' then v_branch.delivery_fee_idr else 0 end;
  v_promo:=private.resolve_voucher_discount(v_customer_json,v_subtotal,p_payload->>'promoCode');
  v_discount:=coalesce((v_promo->>'discountIdr')::bigint,0);
  return jsonb_build_object('itemsSubtotalIdr',v_subtotal,'deliveryFeeIdr',v_delivery,'discountIdr',v_discount,'totalIdr',greatest(0,v_subtotal-v_discount+v_delivery),'promoCode',nullif(upper(trim(coalesce(p_payload->>'promoCode',''))),''),'promoAccepted',coalesce((v_promo->>'promoAccepted')::boolean,false),'promoMessage',v_promo->>'promoMessage');
end;
$$;
revoke execute on function public.quote_internal_order(jsonb) from public,anon;
grant execute on function public.quote_internal_order(jsonb) to authenticated;

-- CRM business metrics share the exact verified-business rule used by vouchers.
create or replace function public.get_customer_business_metrics(p_customer_id text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_rows jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not (private.has_section_access('customers','view') or private.has_action_permission('orders.create')) then raise exception 'CUSTOMER_METRICS_FORBIDDEN' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'customerId',c.id,
    'lifetimeSpendIdr',coalesce((m.metrics->>'spendIdr')::bigint,0),
    'orderCount',coalesce((m.metrics->>'orderCount')::integer,0),
    'segment',case
      when coalesce((m.metrics->>'orderCount')::integer,0)=0 then 'new'
      when (case coalesce(s.customer_segments->>'mode','either')
        when 'spend' then coalesce((m.metrics->>'spendIdr')::bigint,0)>=coalesce((s.customer_segments->>'minLifetimeSpend')::bigint,1000000)
        when 'orders' then coalesce((m.metrics->>'orderCount')::integer,0)>=coalesce((s.customer_segments->>'minOrderCount')::integer,5)
        else coalesce((m.metrics->>'spendIdr')::bigint,0)>=coalesce((s.customer_segments->>'minLifetimeSpend')::bigint,1000000) or coalesce((m.metrics->>'orderCount')::integer,0)>=coalesce((s.customer_segments->>'minOrderCount')::integer,5) end) then 'vip'
      else 'regular' end
  ) order by c.id),'[]'::jsonb) into v_rows
  from public.customers c
  cross join private.internal_settings_state s
  cross join lateral (select private.customer_voucher_metrics(c.id) metrics) m
  where s.id='primary' and (p_customer_id is null or c.id=p_customer_id);
  return v_rows;
end;
$$;
revoke execute on function public.get_customer_business_metrics(text) from public,anon;
grant execute on function public.get_customer_business_metrics(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal Order idempotency uses semantic input only and every accepted
-- Customer intake mutation advances CRM revision. Legacy V3.6 request hashes
-- remain accepted for safe retries during rolling deployment.
-- ---------------------------------------------------------------------------
create or replace function private.internal_order_semantic_payload(p_payload jsonb)
returns jsonb
language sql
immutable
set search_path=''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'customer',jsonb_strip_nulls(jsonb_build_object('id',p_payload->'customer'->>'id','name',trim(coalesce(p_payload->'customer'->>'name','')),'whatsappNumber',private.normalize_whatsapp(p_payload->'customer'->>'whatsappNumber'),'email',lower(nullif(trim(coalesce(p_payload->'customer'->>'email','')),'')),'birthday',nullif(p_payload->'customer'->>'birthday',''),'acceptedProfileUpdates',p_payload->'customer'->'acceptedProfileUpdates')),
    'branchId',p_payload->>'branchId','source',p_payload->>'source','fulfillment',p_payload->>'fulfillment','scheduleDate',p_payload->>'scheduleDate','scheduleTime',p_payload->>'scheduleTime',
    'items',(select coalesce(jsonb_agg(case when coalesce(i->>'mode','catalog')='catalog' then jsonb_build_object('mode','catalog','productId',i->>'productId','variantId',i->>'variantId','quantity',coalesce((i->>'quantity')::integer,0)) else jsonb_build_object('mode','custom','productName',trim(coalesce(i->>'productName','')),'quantity',coalesce((i->>'quantity')::integer,0),'unitPriceIdr',coalesce((i->>'unitPriceIdr')::bigint,0)) end order by ord),'[]'::jsonb) from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) with ordinality e(i,ord)),
    'deliveryAddress',nullif(trim(coalesce(p_payload->>'deliveryAddress','')),''),'deliveryInstructions',nullif(trim(coalesce(p_payload->>'deliveryInstructions','')),''),'orderNote',nullif(trim(coalesce(p_payload->>'orderNote','')),''),'greetingMessage',nullif(trim(coalesce(p_payload->>'greetingMessage','')),''),'greetingCardName',nullif(trim(coalesce(p_payload->>'greetingCardName','')),''),
    'paymentMethod',p_payload->>'paymentMethod','paymentStatus',p_payload->>'paymentStatus','depositAmountIdr',coalesce((p_payload->>'depositAmountIdr')::bigint,0),'promoCode',upper(nullif(trim(coalesce(p_payload->>'promoCode','')),''))
  ))
$$;
revoke execute on function private.internal_order_semantic_payload(jsonb) from public,anon,authenticated;

alter function public.create_internal_order(jsonb) rename to create_internal_order_v36_internal;
revoke execute on function public.create_internal_order_v36_internal(jsonb) from public,anon,authenticated;
create or replace function public.create_internal_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key text:=trim(coalesce(p_payload->>'idempotencyKey','')); v_hash text; v_legacy_hash text; v_existing public.orders%rowtype; v_result jsonb;
  v_normalized text; v_existing_customer public.customers%rowtype; v_customer_id text; v_dedup boolean;
  v_expected_quote jsonb:=p_payload->'expectedQuote'; v_authoritative_quote jsonb;
begin
  if length(v_key)<16 or length(v_key)>128 then raise exception 'VALID_IDEMPOTENCY_KEY_REQUIRED' using errcode='22023'; end if;
  v_hash:=private.jsonb_request_hash(private.internal_order_semantic_payload(p_payload)); v_legacy_hash:=private.jsonb_request_hash(coalesce(p_payload,'{}'::jsonb)-'idempotencyKey');
  perform pg_advisory_xact_lock(hashtextextended('internal-order:'||v_key,0));
  select * into v_existing from public.orders where storefront_idempotency_key=v_key limit 1;
  if found then
    if v_existing.idempotency_request_hash is null or v_existing.idempotency_request_hash not in (v_hash,v_legacy_hash) then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023'; end if;
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
  v_result:=public.create_internal_order_v36_internal(p_payload); v_dedup:=coalesce((v_result->>'deduplicated')::boolean,false); v_customer_id:=v_result->>'customerId';
  select * into v_existing from public.orders where id=v_result->>'orderId';
  if v_existing.idempotency_request_hash is not null and v_existing.idempotency_request_hash not in (v_hash,v_legacy_hash) then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='22023'; end if;
  update public.orders set idempotency_request_hash=v_hash where id=v_existing.id;
  if not v_dedup and v_existing_customer.id is not null and v_customer_id=v_existing_customer.id then
    update public.customers set revision=revision+1,updated_at=now() where id=v_customer_id;
  end if;
  select * into v_existing from public.orders where id=v_result->>'orderId';
  return private.order_idempotency_result(v_existing,v_dedup);
end;
$$;
revoke execute on function public.create_internal_order(jsonb) from public,anon;
grant execute on function public.create_internal_order(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Point-event commands: normalized rows are authoritative; generic HR JSON
-- saves may no longer invent/review/reverse point entries.
-- ---------------------------------------------------------------------------
create or replace function private.refresh_hr_point_projection() returns bigint
language plpgsql security definer set search_path='' as $$
declare v_points jsonb; v_revision bigint;
begin
  select coalesce(jsonb_agg(private.employee_point_event_json(e) order by e.created_at desc,e.id),'[]'::jsonb) into v_points from public.employee_point_events e;
  update private.operational_domain_state set revision=revision+1,snapshot=jsonb_set(coalesce(snapshot,'{}'::jsonb),'{employeePointEntries}',v_points,true),updated_by=(select auth.uid()),updated_at=now() where domain='hr' returning revision into v_revision;
  return v_revision;
end; $$;
revoke execute on function private.refresh_hr_point_projection() from public,anon,authenticated;

alter function public.save_hr_operational_state(bigint,jsonb) rename to save_hr_operational_state_v36_internal;
revoke execute on function public.save_hr_operational_state_v36_internal(bigint,jsonb) from public,anon,authenticated;
create or replace function public.save_hr_operational_state(p_expected_revision bigint,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_points jsonb; v_snapshot jsonb:=coalesce(p_snapshot,'{}'::jsonb);
begin
  select coalesce(jsonb_agg(private.employee_point_event_json(e) order by e.created_at desc,e.id),'[]'::jsonb) into v_points from public.employee_point_events e;
  v_snapshot:=jsonb_set(v_snapshot,'{employeePointEntries}',v_points,true);
  return public.save_hr_operational_state_v36_internal(p_expected_revision,v_snapshot);
end; $$;
revoke execute on function public.save_hr_operational_state(bigint,jsonb) from public,anon; grant execute on function public.save_hr_operational_state(bigint,jsonb) to authenticated;

create or replace function private.require_point_manager() returns public.staff_access_profiles
language plpgsql security definer set search_path='' as $$ declare v public.staff_access_profiles%rowtype; begin select * into v from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1; if not found or v.role not in ('owner','hr') or not private.has_action_permission('hr.manage_points') then raise exception 'POINT_MANAGEMENT_FORBIDDEN' using errcode='42501'; end if; return v; end $$;
revoke execute on function private.require_point_manager() from public,anon,authenticated;

create or replace function public.create_employee_point(p_entry jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_profile public.staff_access_profiles%rowtype; v_id text; v_employee text:=p_entry->>'employeeId'; v_points integer:=coalesce((p_entry->>'points')::integer,0); v_source_type text:=coalesce(p_entry->>'sourceType','manual'); v_source_id text:=nullif(p_entry->>'sourceId',''); v_reason text:=nullif(trim(coalesce(p_entry->>'reason','')),''); v_effective date:=coalesce(nullif(p_entry->>'effectiveDate','')::date,timezone('Asia/Jakarta',now())::date); v_period text; v_category text; v_event public.employee_point_events%rowtype;
begin
  v_profile:=private.require_point_manager(); if v_points=0 or v_reason is null then raise exception 'VALID_POINT_ADJUSTMENT_REQUIRED' using errcode='22023'; end if; if v_source_type not in ('manual','attendance_review') then raise exception 'POINT_SOURCE_NOT_CLIENT_CREATABLE' using errcode='42501'; end if; if nullif(v_employee,'') is null or not exists(select 1 from public.staff_access_profiles where employee_id=v_employee) then raise exception 'EMPLOYEE_NOT_FOUND' using errcode='P0002'; end if;
  v_category:=case when v_source_type='attendance_review' then 'attendance_penalty' when v_points>0 then 'manual_reward' else 'manual_penalty' end; v_period:=private.payroll_period_for_date(v_effective); v_id:=coalesce(nullif(p_entry->>'id',''),'point-'||replace(gen_random_uuid()::text,'-','')); v_source_id:=coalesce(v_source_id,'manual:'||replace(gen_random_uuid()::text,'-',''));
  insert into public.employee_point_events(id,employee_id,category,points,effective_date,payroll_period_id,status,metadata,created_at,source_type,source_id,reason,created_by) values(v_id,v_employee,v_category,v_points,v_effective,v_period,'pending','{}'::jsonb,now(),v_source_type,v_source_id,v_reason,v_profile.display_name) returning * into v_event;
  perform private.refresh_hr_point_projection(); perform private.write_audit_event('hr.point.create','employee_point',v_id,'succeeded',null,null,null,private.employee_point_event_json(v_event)); return private.employee_point_event_json(v_event);
end; $$;
revoke execute on function public.create_employee_point(jsonb) from public,anon; grant execute on function public.create_employee_point(jsonb) to authenticated;

create or replace function public.review_employee_point(p_entry_id text,p_decision text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_profile public.staff_access_profiles%rowtype; v_event public.employee_point_events%rowtype; v_max integer; v_used integer;
begin
  v_profile:=private.require_point_manager(); if p_decision not in ('approved','rejected') then raise exception 'INVALID_POINT_DECISION' using errcode='22023'; end if; select * into v_event from public.employee_point_events where id=p_entry_id for update; if not found then raise exception 'POINT_NOT_FOUND' using errcode='P0002'; end if; if v_event.status<>'pending' then raise exception 'POINT_NOT_PENDING' using errcode='22023'; end if; if p_decision='rejected' and nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'POINT_REJECTION_NOTE_REQUIRED' using errcode='22023'; end if;
  if p_decision='approved' and v_event.points<0 then select coalesce((snapshot->'pointRules'->>'maximumMinusPointsPerPeriod')::integer,50) into v_max from private.operational_domain_state where domain='hr'; select coalesce(sum(abs(points)),0) into v_used from public.employee_point_events where employee_id=v_event.employee_id and status='approved' and points<0 and payroll_period_id=v_event.payroll_period_id; if v_used+abs(v_event.points)>v_max then raise exception 'POINT_MINUS_LIMIT_EXCEEDED' using errcode='22023'; end if; end if;
  update public.employee_point_events set status=p_decision,reviewed_by=v_profile.display_name,reviewed_at=now(),review_note=nullif(trim(coalesce(p_note,'')),'') where id=p_entry_id returning * into v_event; perform private.refresh_hr_point_projection(); perform private.write_audit_event('hr.point.review','employee_point',p_entry_id,'succeeded',null,null,null,private.employee_point_event_json(v_event),jsonb_build_object('decision',p_decision)); return private.employee_point_event_json(v_event);
end; $$;
revoke execute on function public.review_employee_point(text,text,text) from public,anon; grant execute on function public.review_employee_point(text,text,text) to authenticated;

create or replace function public.reverse_employee_point(p_entry_id text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_profile public.staff_access_profiles%rowtype; v_target public.employee_point_events%rowtype; v_reversal public.employee_point_events%rowtype; v_id text:='point-'||replace(gen_random_uuid()::text,'-','');
begin
  v_profile:=private.require_point_manager(); if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'POINT_REVERSAL_REASON_REQUIRED' using errcode='22023'; end if; select * into v_target from public.employee_point_events where id=p_entry_id for update; if not found then raise exception 'POINT_NOT_FOUND' using errcode='P0002'; end if; if v_target.status<>'approved' then raise exception 'ONLY_APPROVED_POINT_CAN_REVERSE' using errcode='22023'; end if; if exists(select 1 from public.employee_point_events where source_type='reversal' and source_id=p_entry_id) then raise exception 'POINT_ALREADY_REVERSED' using errcode='23505'; end if;
  insert into public.employee_point_events(id,employee_id,category,points,effective_date,payroll_period_id,status,metadata,created_at,source_type,source_id,reason,created_by) values(v_id,v_target.employee_id,'reversal',-v_target.points,timezone('Asia/Jakarta',now())::date,v_target.payroll_period_id,'approved','{}'::jsonb,now(),'reversal',p_entry_id,trim(p_reason),v_profile.display_name) returning * into v_reversal; update public.employee_point_events set status='reversed',reversed_by_entry_id=v_id,reviewed_by=v_profile.display_name,reviewed_at=now(),review_note=trim(p_reason) where id=p_entry_id; perform private.refresh_hr_point_projection(); perform private.write_audit_event('hr.point.reverse','employee_point',p_entry_id,'succeeded',null,null,null,private.employee_point_event_json(v_reversal)); return private.employee_point_event_json(v_reversal);
end; $$;
revoke execute on function public.reverse_employee_point(text,text) from public,anon; grant execute on function public.reverse_employee_point(text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Finance review actor/timestamp are server stamped.
-- ---------------------------------------------------------------------------
alter function public.save_finance_operational_state(bigint,jsonb) rename to save_finance_operational_state_v36_internal;
revoke execute on function public.save_finance_operational_state_v36_internal(bigint,jsonb) from public,anon,authenticated;
create or replace function public.save_finance_operational_state(p_expected_revision bigint,p_snapshot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_profile public.staff_access_profiles%rowtype; v_previous jsonb; v_transactions jsonb; v_tx jsonb; v_old jsonb; v_next jsonb:='[]'::jsonb;
begin
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true limit 1; if not found then raise exception 'ACTIVE_STAFF_REQUIRED' using errcode='42501'; end if;
  select coalesce(snapshot,'{}'::jsonb) into v_previous from private.operational_domain_state where domain='finance'; v_transactions:=coalesce(p_snapshot->'transactions','[]'::jsonb);
  for v_tx in select value from jsonb_array_elements(v_transactions) loop select value into v_old from jsonb_array_elements(coalesce(v_previous->'transactions','[]'::jsonb)) e(value) where value->>'id'=v_tx->>'id' limit 1; if v_old is not null and coalesce(v_tx->>'status','') is distinct from coalesce(v_old->>'status','') and v_tx->>'status' in ('verified','rejected') then v_tx:=v_tx||jsonb_build_object('actor',v_profile.display_name,'updatedAt',now()); end if; v_next:=v_next||jsonb_build_array(v_tx); v_old:=null; end loop;
  return public.save_finance_operational_state_v36_internal(p_expected_revision,jsonb_set(coalesce(p_snapshot,'{}'::jsonb),'{transactions}',v_next,true));
end; $$;
revoke execute on function public.save_finance_operational_state(bigint,jsonb) from public,anon; grant execute on function public.save_finance_operational_state(bigint,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Attendance selfies are private immutable Storage objects. PostgreSQL trusts
-- only staff-scoped object paths; location/status remain server derived.
-- ---------------------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attendance-selfies','attendance-selfies',false,102400,array['image/jpeg']) on conflict(id) do update set public=false,file_size_limit=102400,allowed_mime_types=array['image/jpeg'];
drop policy if exists attendance_selfies_select on storage.objects; create policy attendance_selfies_select on storage.objects for select to authenticated using(bucket_id='attendance-selfies' and ((storage.foldername(name))[1]=private.current_staff_employee_id() or private.has_action_permission('hr.review_attendance')));
drop policy if exists attendance_selfies_insert on storage.objects; create policy attendance_selfies_insert on storage.objects for insert to authenticated with check(bucket_id='attendance-selfies' and (storage.foldername(name))[1]=private.current_staff_employee_id());
drop policy if exists attendance_selfies_delete on storage.objects; create policy attendance_selfies_delete on storage.objects for delete to authenticated using(bucket_id='attendance-selfies' and ((storage.foldername(name))[1]=private.current_staff_employee_id() or private.has_action_permission('hr.review_attendance')));

-- Override V3.6 self-attendance to accept only private Storage paths.
create or replace function public.save_my_attendance_record(p_record jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_profile public.staff_access_profiles%rowtype; v_existing jsonb; v_now timestamptz:=now(); v_date date:=timezone('Asia/Jakarta',v_now)::date;
  v_location jsonb; v_lat double precision; v_lng double precision; v_accuracy double precision; v_radius integer; v_grace integer;
  v_branch public.branches%rowtype; v_distance integer; v_day text:=lower(trim(to_char(v_date,'FMDay'))); v_shift jsonb; v_override jsonb; v_defaults jsonb;
  v_schedule_branch text; v_start time; v_end time; v_is_working boolean:=false; v_current time:=timezone('Asia/Jakarta',v_now)::time;
  v_mismatch boolean:=false; v_review_reason text; v_status text; v_evidence jsonb; v_safe jsonb; v_state private.operational_domain_state%rowtype; v_records jsonb; v_revision bigint;
  v_is_checkout boolean:=nullif(p_record->>'checkOutSelfieDataUrl','') is not null;
begin
  select * into v_profile from public.staff_access_profiles where user_id=(select auth.uid()) and is_active=true and role in ('admin','florist') limit 1;
  if not found then raise exception 'SELF_ATTENDANCE_ROLE_REQUIRED' using errcode='42501'; end if;
  if nullif(p_record->>'date','')::date is distinct from v_date then raise exception 'ATTENDANCE_DATE_MUST_BE_TODAY' using errcode='22023'; end if;
  select record into v_existing from public.staff_attendance_records where employee_id=v_profile.employee_id and attendance_date=v_date for update;

  if v_is_checkout then
    if v_existing is null or nullif(v_existing->>'checkInAt','') is null then raise exception 'CHECKOUT_REQUIRES_EXISTING_CHECKIN' using errcode='22023'; end if;
    if nullif(v_existing->>'checkOutAt','') is not null then return jsonb_build_object('record',v_existing,'revision',null,'updatedAt',v_now); end if;
    if nullif(p_record->>'checkOutSelfieDataUrl','') is null or p_record->>'checkOutSelfieDataUrl' not like v_profile.employee_id||'/%' then raise exception 'VALID_CHECKOUT_SELFIE_PATH_REQUIRED' using errcode='22023'; end if;
    v_location:=p_record->'checkOutLocation';
  else
    if v_existing is not null then raise exception 'ATTENDANCE_ALREADY_RECORDED' using errcode='23505'; end if;
    if nullif(p_record->>'selfieDataUrl','') is null or p_record->>'selfieDataUrl' not like v_profile.employee_id||'/%' then raise exception 'VALID_CHECKIN_SELFIE_PATH_REQUIRED' using errcode='22023'; end if;
    v_location:=p_record->'checkInLocation';
  end if;
  if jsonb_typeof(v_location)<>'object' then raise exception 'LOCATION_REQUIRED' using errcode='22023'; end if;
  v_lat:=(v_location->>'latitude')::double precision; v_lng:=(v_location->>'longitude')::double precision; v_accuracy:=greatest(0,coalesce((v_location->>'accuracyMeters')::double precision,0));
  if v_lat not between -90 and 90 or v_lng not between -180 and 180 then raise exception 'INVALID_LOCATION' using errcode='22023'; end if;
  select coalesce((attendance->>'locationRadiusMeters')::integer,100),coalesce((attendance->>'lateGraceMinutes')::integer,10) into v_radius,v_grace from private.internal_settings_state where id='primary';
  select * into v_branch
  from public.branches b where b.is_active=true and b.latitude is not null and b.longitude is not null
  order by private.geo_distance_meters(v_lat,v_lng,b.latitude,b.longitude) limit 1;
  if not found then raise exception 'NO_BRANCH_LOCATION_CONFIGURED' using errcode='55000'; end if;
  v_distance:=private.geo_distance_meters(v_lat,v_lng,v_branch.latitude,v_branch.longitude);
  if v_distance>v_radius then raise exception 'OUTSIDE_ATTENDANCE_RADIUS' using errcode='22023'; end if;

  select shift into v_override from public.staff_schedule_overrides where employee_id=v_profile.employee_id and schedule_date=v_date;
  select days into v_defaults from public.staff_schedule_defaults where employee_id=v_profile.employee_id;
  v_shift:=coalesce(v_override,v_defaults->v_day,(select scheduling->'defaultWeeklySchedule'->v_day from private.internal_settings_state where id='primary'),'{}'::jsonb);
  v_is_working:=coalesce((v_shift->>'isWorking')::boolean,false);
  v_schedule_branch:=coalesce(nullif(v_shift->>'branchId',''),v_profile.branch_id);
  v_start:=nullif(v_shift->>'startTime','')::time; v_end:=nullif(v_shift->>'endTime','')::time;
  v_mismatch:=not v_is_working or (v_schedule_branch is not null and v_schedule_branch<>v_branch.id) or v_accuracy>v_radius*4 or (v_start is not null and v_end is not null and (v_current<v_start or v_current>v_end));
  v_review_reason:=concat_ws(' ',case when not v_is_working then 'Recorded on a scheduled day off.' end,case when v_schedule_branch is not null and v_schedule_branch<>v_branch.id then 'Detected branch differs from scheduled branch.' end,case when v_accuracy>v_radius*4 then 'GPS accuracy requires HR review.' end,case when v_start is not null and v_end is not null and (v_current<v_start or v_current>v_end) then 'Recorded outside the scheduled shift.' end);
  v_status:=case when v_is_working and v_start is not null and v_current>v_start+(v_grace||' minutes')::interval then 'late' else 'present' end;
  v_evidence:=jsonb_build_object('latitude',v_lat,'longitude',v_lng,'accuracyMeters',round(v_accuracy),'branchLatitude',v_branch.latitude,'branchLongitude',v_branch.longitude,'distanceMeters',v_distance,'acceptedRadiusMeters',v_radius,'withinRange',true,'detectedBranchId',v_branch.id,'detectedBranchName',v_branch.name,'scheduledBranchId',v_schedule_branch,'scheduledStartTime',case when v_start is null then null else to_char(v_start,'HH24:MI') end,'scheduledEndTime',case when v_end is null then null else to_char(v_end,'HH24:MI') end,'branchMismatch',v_schedule_branch is not null and v_schedule_branch<>v_branch.id,'scheduleMismatch',v_mismatch,'reviewStatus',case when v_mismatch then 'pending_review' else 'not_required' end,'reviewReason',nullif(v_review_reason,''));

  if v_is_checkout then
    v_safe:=v_existing||jsonb_build_object('checkOutAt',v_now,'checkOutSelfieDataUrl',p_record->>'checkOutSelfieDataUrl','checkOutLocation',v_evidence,'actor',v_profile.display_name);
  else
    v_safe:=jsonb_build_object('id','att-'||replace(gen_random_uuid()::text,'-',''),'employeeId',v_profile.employee_id,'date',v_date,'status',v_status,'actor',v_profile.display_name,'createdAt',v_now,'selfieDataUrl',p_record->>'selfieDataUrl','checkInAt',v_now,'source','selfie','checkInLocation',v_evidence);
  end if;

  insert into public.staff_attendance_records(id,employee_id,attendance_date,status,record,updated_at)
  values(v_safe->>'id',v_profile.employee_id,v_date,v_safe->>'status',v_safe,now())
  on conflict(employee_id,attendance_date) do update set status=excluded.status,record=excluded.record,updated_at=now();

  select * into v_state from private.operational_domain_state where domain='hr' for update;
  if not found then
    insert into private.operational_domain_state(domain,revision,snapshot,updated_by,updated_at)
    values('hr',1,jsonb_build_object('attendance',jsonb_build_array(v_safe)),(select auth.uid()),now())
    returning revision into v_revision;
  else
    select coalesce(jsonb_agg(value),'[]'::jsonb) into v_records from jsonb_array_elements(coalesce(v_state.snapshot->'attendance','[]'::jsonb)) e(value) where not(value->>'employeeId'=v_profile.employee_id and value->>'date'=v_date::text);
    v_records:=coalesce(v_records,'[]'::jsonb)||jsonb_build_array(v_safe);
    update private.operational_domain_state set revision=revision+1,snapshot=jsonb_set(coalesce(snapshot,'{}'::jsonb),'{attendance}',v_records,true),updated_by=(select auth.uid()),updated_at=now() where domain='hr' returning revision into v_revision;
  end if;
  perform private.write_audit_event('attendance.self_service','attendance',v_safe->>'id','succeeded',null,v_revision,v_existing,v_safe);
  perform private.write_business_activity('hr',v_safe->>'id',v_branch.id,'attendance_recorded','Staff attendance was recorded.',jsonb_build_object('activityScope','attendance','employeeId',v_profile.employee_id,'date',v_date));
  return jsonb_build_object('record',v_safe,'revision',v_revision,'updatedAt',now());
end;
$$;

revoke execute on function public.save_my_attendance_record(jsonb) from public,anon; grant execute on function public.save_my_attendance_record(jsonb) to authenticated;

commit;
