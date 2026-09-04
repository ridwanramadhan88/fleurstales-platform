-- Fleurstales V3.8 live smoke: Florist Order access remains assigned-read-only.
do $$
declare
  v_allowed_roles text[];
  v_enabled boolean;
  v_wrapper_source text;
  v_internal_source text;
begin
  select allowed_roles into v_allowed_roles
  from private.action_capability_registry
  where capability = 'orders.advance_status';

  if v_allowed_roles is null
    or 'florist' = any(v_allowed_roles)
    or not ('owner' = any(v_allowed_roles))
    or not ('admin' = any(v_allowed_roles))
  then
    raise exception 'orders.advance_status role family is invalid: %', v_allowed_roles;
  end if;

  select enabled into v_enabled
  from private.role_action_permissions
  where role = 'florist'
    and capability = 'orders.advance_status';

  if coalesce(v_enabled, true) then
    raise exception 'Florist orders.advance_status must be disabled';
  end if;

  select pg_get_functiondef(
    'public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_wrapper_source;

  if position('save_order_operational_state_unchecked' in v_wrapper_source) = 0
     or position('mutation_conflict_circuit_is_blocked' in v_wrapper_source) = 0 then
    raise exception 'Guarded public Order writer lost delegation or conflict circuit';
  end if;

  select pg_get_functiondef(
    'public.save_order_operational_state_unchecked(text,integer,integer,jsonb,jsonb,jsonb)'::regprocedure
  ) into v_internal_source;

  if position('FLORIST_ORDER_READ_ONLY' in v_internal_source) = 0 then
    raise exception 'Unchecked Order authority does not reject Florist mutations';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.save_order_operational_state_v37_internal(text,integer,integer,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated can execute the V3.7 internal writer directly';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.save_order_operational_state_unchecked(text,integer,integer,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated can bypass the guarded Order writer';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated staff cannot execute the protected public Order writer';
  end if;
end
$$;
