-- Daily order numbers (25 Nov 2026): <BRANCH>-YY-MM-DD-NNN, a separate
-- sequence per branch per Jakarta day starting at 001, growing past 999.
-- Rolls back.
begin;

do $smoke$
declare
  v_number text;
begin
  if to_regclass('public.order_daily_sequences') is null then
    raise exception 'Missing public.order_daily_sequences';
  end if;
  if has_table_privilege('anon', 'public.order_daily_sequences', 'SELECT')
     or has_table_privilege('authenticated', 'public.order_daily_sequences', 'INSERT')
     or has_table_privilege('authenticated', 'public.order_daily_sequences', 'UPDATE') then
    raise exception 'order_daily_sequences must only be advanced by allocate_order_number';
  end if;

  delete from public.order_daily_sequences where sequence_date between date '2031-01-01' and date '2031-01-02';

  -- 23:59 WIB on 1 Jan 2031, then 00:00 WIB on 2 Jan 2031.
  v_number := private.allocate_order_number('Kedamaian', timestamptz '2031-01-01 16:59:00+00');
  if v_number <> 'KDM-31-01-01-001' then raise exception 'Expected KDM-31-01-01-001, got %', v_number; end if;
  v_number := private.allocate_order_number('Kedamaian', timestamptz '2031-01-01 17:00:00+00');
  if v_number <> 'KDM-31-01-02-001' then raise exception 'Sequence must reset at 00:00 WIB, got %', v_number; end if;
  v_number := private.allocate_order_number('Kedamaian', timestamptz '2031-01-01 18:00:00+00');
  if v_number <> 'KDM-31-01-02-002' then raise exception 'Expected KDM-31-01-02-002, got %', v_number; end if;

  -- Each branch has its own sequence.
  v_number := private.allocate_order_number('Pahoman', timestamptz '2031-01-01 18:00:00+00');
  if v_number <> 'PHM-31-01-02-001' then raise exception 'Expected PHM-31-01-02-001, got %', v_number; end if;

  -- Past 999 the number grows instead of wrapping.
  update public.order_daily_sequences set last_sequence = 998
  where branch_id = 'Pahoman' and sequence_date = date '2031-01-02';
  v_number := private.allocate_order_number('Pahoman', timestamptz '2031-01-01 18:00:00+00');
  if v_number <> 'PHM-31-01-02-999' then raise exception 'Expected PHM-31-01-02-999, got %', v_number; end if;
  v_number := private.allocate_order_number('Pahoman', timestamptz '2031-01-01 18:00:00+00');
  if v_number <> 'PHM-31-01-02-1000' then raise exception 'Expected PHM-31-01-02-1000, got %', v_number; end if;
end
$smoke$;

rollback;
