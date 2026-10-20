-- Cash payment confirmation was rejected for every order created inside the OS.
--
-- The cash branch of the payment functions raised STOREFRONT_TRANSFER_ONLY when
-- `storefront_idempotency_key is not null`. Orders created by staff in the OS
-- also carry an idempotency key (prefix `internal:`), so confirming a cash
-- payment always failed, which blocked assigning a florist and starting
-- production for those orders. Only customer-app orders must stay
-- transfer-only: they are identified by `source = 'customer_app'` or by a
-- public checkout key that does not use the staff `internal:` prefix.
--
-- The three live functions are patched in place from their current definitions
-- so nothing else in them can drift; the migration fails loudly if the
-- expected text is not found exactly once.

begin;

do $migration$
declare
  v_function text;
  v_def text;
  v_old constant text := 'v_order.storefront_idempotency_key is not null or v_order.source=''customer_app''';
  v_new constant text := '(v_order.source=''customer_app'' or (v_order.storefront_idempotency_key is not null and v_order.storefront_idempotency_key not like ''internal:%''))';
  v_oid oid;
begin
  foreach v_function in array array[
    'confirm_order_payment_for_processing',
    'confirm_order_payment_with_proof',
    'process_order_for_production'
  ] loop
    select p.oid into v_oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = v_function;
    if v_oid is null then
      raise exception 'Function public.% not found', v_function;
    end if;

    v_def := pg_get_functiondef(v_oid);
    if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'Expected exactly one storefront-only cash check in public.%', v_function;
    end if;

    execute replace(v_def, v_old, v_new);

    v_def := pg_get_functiondef(v_oid);
    if position(v_new in v_def) = 0 or position(v_old in v_def) > 0 then
      raise exception 'Cash payment check was not updated in public.%', v_function;
    end if;
  end loop;
end
$migration$;

commit;
