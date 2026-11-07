-- Laporan Keuangan (format LK): Finance and the Owner read the ledger for the
-- monthly report (Owner decision 2026-11-07). The Owner still cannot open the
-- Finance workspace or write anything; this is a read-only projection of the
-- ledger rows and category labels the report needs.

begin;

create or replace function public.get_finance_report_ledger()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text := private.current_staff_role();
  v_snapshot jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not (v_role = 'owner' or (v_role = 'finance' and private.has_action_permission('finance.view_ledger'))) then
    raise exception 'FINANCE_REPORT_FORBIDDEN' using errcode = '42501';
  end if;

  select snapshot into v_snapshot from private.operational_domain_state where domain = 'finance';
  return jsonb_build_object(
    'transactions', coalesce(v_snapshot->'transactions', '[]'::jsonb),
    'customCategories', coalesce(v_snapshot->'customCategories', '[]'::jsonb),
    'categoryOverrides', coalesce(v_snapshot->'categoryOverrides', '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_finance_report_ledger() from public, anon;
grant execute on function public.get_finance_report_ledger() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
