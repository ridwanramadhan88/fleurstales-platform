begin;

do $$
begin
  if to_regclass('public.arrangement_types') is null then
    raise exception 'Arrangement type registry is missing';
  end if;
  if to_regprocedure('public.replace_arrangement_types(jsonb)') is null then
    raise exception 'Arrangement type management RPC is missing';
  end if;
  if not has_function_privilege('authenticated', 'public.replace_arrangement_types(jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.replace_arrangement_types(jsonb)', 'EXECUTE') then
    raise exception 'Arrangement type RPC grants are incorrect';
  end if;
end;
$$;

rollback;
