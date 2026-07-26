create or replace function public.save_hr_operational_state(
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_points jsonb;
  v_snapshot jsonb := coalesce(p_snapshot, '{}'::jsonb);
  v_state private.operational_domain_state%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'INVALID_EXPECTED_REVISION' using errcode='22023';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'SNAPSHOT_OBJECT_REQUIRED' using errcode='22023';
  end if;

  select coalesce(
    jsonb_agg(private.employee_point_event_json(e) order by e.created_at desc, e.id),
    '[]'::jsonb
  )
  into v_points
  from public.employee_point_events e;

  v_snapshot := jsonb_set(v_snapshot, '{employeePointEntries}', v_points, true);

  select *
  into v_state
  from private.operational_domain_state
  where domain = 'hr';

  if found then
    if v_state.revision <> p_expected_revision then
      if v_state.snapshot = v_snapshot then
        return jsonb_build_object(
          'domain', v_state.domain,
          'revision', v_state.revision,
          'snapshot', v_state.snapshot,
          'updatedAt', v_state.updated_at
        );
      end if;

      raise exception 'REVISION_CONFLICT:hr:expected=%:actual=%',
        p_expected_revision, v_state.revision
        using errcode='40001';
    end if;
  elsif p_expected_revision <> 0 then
    raise exception 'REVISION_CONFLICT:hr:expected=%:actual=0',
      p_expected_revision
      using errcode='40001';
  end if;

  return public.save_hr_operational_state_v36_internal(
    p_expected_revision,
    v_snapshot
  );
end;
$function$;
