-- ---------------------------------------------------------------------------
-- Owner sign-in downloaded ~105 MB of audit history (Nov 25 check).
--
-- list_security_audit_events returned whole rows, including before_state and
-- after_state. Every HR save stores the full HR snapshot in both, so the 1,000
-- newest events were ~105 MB of JSON (379 kB without them), taking up to
-- 4.8 s and growing with every HR save toward the 8 s statement timeout. No
-- screen reads those two columns.
--
-- The listing now leaves them out (they stay stored for audits) and reads the
-- newest events through an occurred_at index instead of sorting the table.
-- ---------------------------------------------------------------------------

create index if not exists audit_events_occurred_at_idx
  on private.audit_events(occurred_at desc);

create or replace function public.list_security_audit_events(p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not private.has_staff_role(array['owner']) then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(a) - 'before_state' - 'after_state' order by a.occurred_at desc)
    from (
      select *
      from private.audit_events
      order by occurred_at desc
      limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) a
  ), '[]'::jsonb);
end;
$$;
