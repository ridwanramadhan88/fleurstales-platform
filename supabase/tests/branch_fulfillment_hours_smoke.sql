-- Pickup & delivery hours: the order-time checks use the branch's
-- fulfillment window when set, opening hours otherwise. Rolls back.
begin;

insert into public.branches(id, name, code, is_active, is_default, sort_order, delivery_fee_idr, opening_hours)
values
  ('smoke-window', 'Smoke Window', 'SMW', true, false, 90, 0,
   (select jsonb_object_agg(d, jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00', 'fulfillmentStartsAt', '08:00', 'fulfillmentEndsAt', '15:00'))
    from unnest(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) d)),
  ('smoke-open', 'Smoke Open', 'SMO', true, false, 91, 0,
   (select jsonb_object_agg(d, jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00'))
    from unnest(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) d));

do $smoke$
declare
  v_tomorrow date := timezone('Asia/Jakarta', now())::date + 1;
  v_message text;
  v_customer jsonb := '{"name":"Smoke","whatsappNumber":"081200000000"}';
  -- Returns the error raised for this time, or 'OK'.
  v_check text;
begin
  if private.branch_fulfillment_window('{"isOpen":true,"opensAt":"07:00","closesAt":"16:00"}')->>'opensAt' <> '07:00' then
    raise exception 'Window without fulfillment hours must fall back to opening hours';
  end if;
  if private.branch_fulfillment_window('{"isOpen":true,"opensAt":"07:00","closesAt":"16:00","fulfillmentStartsAt":"08:00","fulfillmentEndsAt":"15:00"}')->>'closesAt' <> '15:00' then
    raise exception 'Fulfillment window not applied';
  end if;

  -- 07:30: inside opening hours but before pickup & delivery starts -> rejected.
  begin
    perform private.resolve_checkout_quote(v_customer, 'smoke-window', 'pickup', v_tomorrow, '07:30', '[]'::jsonb, 'cash', null);
    raise exception 'Checkout accepted a time before the pickup & delivery window';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'Selected time is outside branch opening hours.' then
      raise exception 'Expected the time-window error, got: %', v_message;
    end if;
  end;

  -- 15:30: after the window -> rejected.
  begin
    perform private.resolve_checkout_quote(v_customer, 'smoke-window', 'pickup', v_tomorrow, '15:30', '[]'::jsonb, 'cash', null);
    raise exception 'Checkout accepted a time after the pickup & delivery window';
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'Selected time is outside branch opening hours.' then
      raise exception 'Expected the time-window error, got: %', v_message;
    end if;
  end;

  -- 08:00 passes the time check (fails later on the empty item list).
  begin
    perform private.resolve_checkout_quote(v_customer, 'smoke-window', 'pickup', v_tomorrow, '08:00', '[]'::jsonb, 'cash', null);
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message like 'Selected time%' or v_message like 'Selected branch is closed%' then
      raise exception '08:00 should be inside the pickup & delivery window, got: %', v_message;
    end if;
  end;

  -- Branch without a window keeps opening hours: 07:30 passes the time check.
  begin
    perform private.resolve_checkout_quote(v_customer, 'smoke-open', 'pickup', v_tomorrow, '07:30', '[]'::jsonb, 'cash', null);
  exception when invalid_parameter_value then
    get stacked diagnostics v_message = message_text;
    if v_message like 'Selected time%' then
      raise exception 'Branch without pickup & delivery hours must keep opening hours, got: %', v_message;
    end if;
  end;

  if not exists (select 1 from pg_proc where proname = 'quote_internal_order' and prosrc like '%private.branch_fulfillment_window(v_branch.opening_hours->v_day_key)%') then
    raise exception 'OS order quote does not use the pickup & delivery window';
  end if;
end
$smoke$;

rollback;
