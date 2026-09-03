-- Admin workflow authority and grant checks. Read-only assertions only.

do $$
declare
  v_runtime_source text;
  v_create_source text;
  v_save_wrapper_source text;
  v_save_internal_source text;
  v_trigger_source text;
begin
  if not has_function_privilege('authenticated','public.set_staff_runtime_context(text,text,date)','EXECUTE')
     or has_function_privilege('anon','public.set_staff_runtime_context(text,text,date)','EXECUTE') then
    raise exception 'Runtime-context RPC grants are incorrect';
  end if;

  if not has_function_privilege('authenticated','public.create_internal_order(jsonb)','EXECUTE')
     or has_function_privilege('anon','public.create_internal_order(jsonb)','EXECUTE') then
    raise exception 'Internal-order RPC grants are incorrect';
  end if;

  if not has_function_privilege('authenticated','public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)','EXECUTE') then
    raise exception 'Order-state RPC grants are incorrect';
  end if;

  if has_function_privilege('authenticated','public.save_order_operational_state_unchecked(text,integer,integer,jsonb,jsonb,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.save_order_operational_state_unchecked(text,integer,integer,jsonb,jsonb,jsonb)','EXECUTE') then
    raise exception 'Authenticated clients can bypass the guarded order-state wrapper';
  end if;

  if has_function_privilege('authenticated','private.on_order_created_event()','EXECUTE')
     or has_function_privilege('anon','private.on_order_created_event()','EXECUTE') then
    raise exception 'Order-created trigger helper is browser-executable';
  end if;

  select pg_get_functiondef('public.set_staff_runtime_context(text,text,date)'::regprocedure) into v_runtime_source;
  if position('ADMIN_DATED_BRANCH_REQUIRED' in v_runtime_source)=0
     or position('ADMIN_BRANCH_SCOPE_REQUIRED' in v_runtime_source)=0
     or position('staff_schedule_overrides' in v_runtime_source)=0 then
    raise exception 'Admin dated-branch runtime authority is incomplete';
  end if;

  select pg_get_functiondef('public.create_internal_order(jsonb)'::regprocedure) into v_create_source;
  if position('create_internal_order_v36_internal' in v_create_source)=0
     or position('set status=''confirmed''' in v_create_source)=0
     or position('creationConfirmation' in v_create_source)=0 then
    raise exception 'Internal-order confirmation wrapper is incomplete';
  end if;

  select pg_get_functiondef('public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)'::regprocedure) into v_save_wrapper_source;
  if position('save_order_operational_state_unchecked' in v_save_wrapper_source)=0
     or position('mutation_conflict_circuit_is_blocked' in v_save_wrapper_source)=0 then
    raise exception 'Guarded order-state wrapper lost delegation or conflict circuit';
  end if;

  select pg_get_functiondef('public.save_order_operational_state_unchecked(text,integer,integer,jsonb,jsonb,jsonb)'::regprocedure) into v_save_internal_source;
  if position('save_order_operational_state_v37_internal' in v_save_internal_source)=0
     or position('ORDER_STATUS_SEQUENCE_REQUIRED' in v_save_internal_source)=0
     or position('Ready for reconciliation' in v_save_internal_source)=0 then
    raise exception 'Order sequence or Finance handoff authority is incomplete';
  end if;

  select pg_get_functiondef('private.on_order_created_event()'::regprocedure) into v_trigger_source;
  if position('order_received' in v_trigger_source)=0
     or position('order_pending_verification' in v_trigger_source)>0 then
    raise exception 'Order-created notification routing is incorrect';
  end if;
end $$;
