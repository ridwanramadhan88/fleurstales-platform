-- Fix transfer Process Order self-conflict.
--
-- Attaching the private payment-proof path updates public.orders, whose
-- orders_bump_revision trigger advances the revision. The original wrapper
-- then delegated to process_order_for_production with the *old* expected
-- revision, so every transfer order deterministically failed with 40001 and
-- rolled back to Confirmed. Capture the post-proof revision and hand that
-- authoritative revision to the core processing command instead.

begin;

create or replace function public.process_order_for_production_with_proof(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text,
  p_florist_employee_id text,
  p_assignment_date date,
  p_assignment_time time without time zone default null,
  p_allow_schedule_override boolean default false,
  p_scheduled_branch_id text default null,
  p_shift_start time without time zone default null,
  p_shift_end time without time zone default null,
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
  v_processing_revision integer;
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

  if v_order.payment_method = 'transfer' then
    if v_proof is null or v_proof not like v_order.id || '/proof-%.jpg' then
      raise exception 'PAYMENT_PROOF_REQUIRED_FOR_TRANSFER' using errcode='22023';
    end if;

    -- orders_bump_revision advances revision here. Capture the actual value
    -- produced by the trigger instead of assuming +1, then delegate with that
    -- value so the core optimistic-lock check remains authoritative.
    update public.orders
    set payment_proof_url=v_proof,
        updated_at=clock_timestamp()
    where id=v_order.id
    returning revision into v_processing_revision;
  elsif v_order.payment_method = 'cash' then
    v_proof := null;
    v_processing_revision := v_order.revision;
  else
    raise exception 'PAYMENT_METHOD_REQUIRED' using errcode='22023';
  end if;

  v_result := public.process_order_for_production(
    p_order_id,
    v_processing_revision,
    p_finance_account_id,
    p_florist_employee_id,
    p_assignment_date,
    p_assignment_time,
    p_allow_schedule_override,
    p_scheduled_branch_id,
    p_shift_start,
    p_shift_end
  );

  return v_result || jsonb_build_object('paymentProofPath',v_proof);
end;
$$;

revoke execute on function public.process_order_for_production_with_proof(
  text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone,text
) from public, anon;
grant execute on function public.process_order_for_production_with_proof(
  text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone,text
) to authenticated, service_role;

commit;
