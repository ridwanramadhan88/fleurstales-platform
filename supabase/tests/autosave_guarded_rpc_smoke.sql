-- Autosave writers: browser roles reach them only through *_guarded wrappers that turn
-- PostgREST-retried 40001 into a single PT409 (HTTP 409).
do $$
declare
  v_pair text[];
  v_pairs text[][] := array[
    array['save_operational_domain_state', 'text,bigint,jsonb'],
    array['save_finance_operational_state', 'bigint,jsonb'],
    array['replace_public_store_snapshot', 'bigint,jsonb,jsonb,jsonb,text'],
    array['save_authorization_config', 'bigint,jsonb,jsonb,jsonb'],
    array['save_internal_settings_config', 'bigint,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb'],
    array['save_customer_profile', 'jsonb,bigint'],
    array['delete_customer_profile', 'text,bigint']
  ];
  v_inner text;
  v_guarded text;
  v_source text;
begin
  foreach v_pair slice 1 in array v_pairs loop
    v_inner := format('public.%s(%s)', v_pair[1], v_pair[2]);
    v_guarded := format('public.%s_guarded(%s)', v_pair[1], v_pair[2]);

    if to_regprocedure(v_guarded) is null then
      raise exception 'Guarded autosave writer is missing: %', v_guarded;
    end if;
    if not has_function_privilege('authenticated', v_guarded, 'EXECUTE')
       or has_function_privilege('anon', v_guarded, 'EXECUTE') then
      raise exception 'Guarded autosave writer grants are incorrect: %', v_guarded;
    end if;
    if has_function_privilege('authenticated', v_inner, 'EXECUTE')
       or has_function_privilege('anon', v_inner, 'EXECUTE') then
      raise exception 'Retired autosave writer is executable by browser roles again: %', v_inner;
    end if;

    select pg_get_functiondef(v_guarded::regprocedure) into v_source;
    if position('serialization_failure' in v_source) = 0 or position('PT409' in v_source) = 0 then
      raise exception 'Guarded autosave writer no longer converts 40001 to PT409: %', v_guarded;
    end if;
  end loop;

  if has_function_privilege('authenticated', 'public.save_hr_operational_state(bigint,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.save_order_operational_state(text,integer,integer,jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'Retired HR/Order writers are executable by browser roles again';
  end if;

  if exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    where d.defaclrole = 'postgres'::regrole
      and n.nspname = 'public'
      and d.defaclobjtype = 'f'
      and d.defaclacl::text ~ '(^|[{,])anon='
  ) then
    raise exception 'New public functions are auto-granted to anon again';
  end if;

  -- Only the intended anonymous Storefront endpoints may run with definer rights for anon.
  select string_agg(p.oid::regprocedure::text, ', ' order by 1)
  into v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname not in (
      'create_storefront_order',
      'quote_storefront_checkout',
      'get_unavailable_order_slots',
      'get_order_public_status',
      'verify_order_tracking_access',
      'submit_order_review'
    );
  if v_source is not null then
    raise exception 'SECURITY DEFINER functions are executable by anon outside the Storefront allowlist: %', v_source;
  end if;
end;
$$;

-- Behaviour: transaction-local stand-ins raise 40001; ROLLBACK restores the real writers.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

create or replace function public.save_operational_domain_state(
  p_domain text, p_expected_revision bigint, p_snapshot jsonb
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if p_expected_revision = -1 then
    raise exception 'REVISION_CONFLICT:%:expected=-1:actual=1', p_domain using errcode = '40001';
  elsif p_expected_revision = -2 then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return p_snapshot;
end;
$$;

create or replace function public.delete_customer_profile(
  p_customer_id text, p_base_revision bigint
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_base_revision = -1 then
    raise exception 'CUSTOMER_CONFLICT:%', p_customer_id using errcode = '40001';
  end if;
end;
$$;

set local role authenticated;
do $test$
declare
  v_snapshot jsonb := '{"unchanged":true}'::jsonb;
begin
  if public.save_operational_domain_state_guarded('finance', 1, v_snapshot) is distinct from v_snapshot then
    raise exception 'Guarded operational save changed the success response';
  end if;
  begin
    perform public.save_operational_domain_state_guarded('finance', -1, '{}');
    raise exception 'Stale operational save was accepted';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'REVISION_CONFLICT:finance:expected=-1:actual=1' then raise; end if;
  end;
  begin
    perform public.save_operational_domain_state_guarded('finance', -2, '{}');
    raise exception 'Operational authorization failure was swallowed';
  exception when insufficient_privilege then
    if sqlerrm <> 'AUTH_REQUIRED' then raise; end if;
  end;

  perform public.delete_customer_profile_guarded('customer_test', 1);
  begin
    perform public.delete_customer_profile_guarded('customer_test', -1);
    raise exception 'Stale customer delete was accepted';
  exception when sqlstate 'PT409' then
    if sqlerrm <> 'CUSTOMER_CONFLICT:customer_test' then raise; end if;
  end;
end;
$test$;
rollback;
