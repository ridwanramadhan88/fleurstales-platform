-- ---------------------------------------------------------------------------
-- HR saves timed out (statement_timeout 8s, Nov 24).
--
-- Every HR save rewrites staff_schedule_overrides, staff_schedule_defaults and
-- staff_attendance_records row by row (~1,150 row changes). Each row fired
-- emit_staff_roster_refresh_event(), which inserted one refresh event and then
-- ran `delete ... where created_at < now() - 2 days` over the whole events
-- table. created_at had no index, so with ~46k events every save did ~1,150
-- sequential scans (tens of millions of rows) and was cancelled.
--
-- Clients only use the INSERT as a "roster changed, re-fetch" signal
-- (realtimeSupabaseSync coalesces them and ignores roster_date), so one event
-- per transaction is enough. The cleanup runs once per transaction, through an
-- index.
-- ---------------------------------------------------------------------------

create index if not exists staff_roster_refresh_events_created_at_idx
  on public.staff_roster_refresh_events(created_at);

create or replace function private.emit_staff_roster_refresh_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_date date;
begin
  -- One refresh signal per transaction: the flag is transaction-local.
  if coalesce(current_setting('fleurstales.roster_refresh_emitted', true), '') <> '1' then
    perform set_config('fleurstales.roster_refresh_emitted', '1', true);

    if tg_table_name='staff_attendance_records' then
      v_date:=case when tg_op='DELETE' then old.attendance_date else new.attendance_date end;
    elsif tg_table_name='staff_schedule_overrides' then
      v_date:=case when tg_op='DELETE' then old.schedule_date else new.schedule_date end;
    else
      v_date:=timezone('Asia/Jakarta',now())::date;
    end if;
    insert into public.staff_roster_refresh_events(roster_date)
    values(coalesce(v_date,timezone('Asia/Jakarta',now())::date));
    delete from public.staff_roster_refresh_events where created_at<now()-interval '2 days';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke execute on function private.emit_staff_roster_refresh_event() from public,anon,authenticated;
