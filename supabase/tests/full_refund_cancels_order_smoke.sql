-- A full refund cancels an in-progress order; finished orders keep their status.
do $$
declare
  v_source text;
begin
  select pg_get_functiondef('public.complete_order_refund_with_account(text,integer,text)'::regprocedure)
  into v_source;
  if position('v_cancel := v_amount >= v_previous_paid' in v_source) = 0
     or position('''pending_verification'',''confirmed'',''processing'',''ready'',''delivering''' in v_source) = 0
     or position('status=case when v_cancel then ''cancelled'' else status end' in v_source) = 0 then
    raise exception 'A full refund no longer cancels an in-progress order';
  end if;
  if position('FULL_REFUND_CANCELS_ORDER' in v_source) = 0
     or position('customer_review_rewards' in v_source) = 0 then
    raise exception 'Automatic cancellation lost its activity log or review-reward release';
  end if;
  -- The earlier guarantees are still there.
  if position('FINANCE_ACCOUNT_INVALID' in v_source) = 0
     or position('REFUND_MUST_BE_PENDING' in v_source) = 0
     or position('REFUND_EVIDENCE_INCOMPLETE' in v_source) = 0 then
    raise exception 'Refund completion lost its account / pending / evidence checks';
  end if;
  if not has_function_privilege('authenticated','public.complete_order_refund_with_account_guarded(text,integer,text)','EXECUTE')
     or has_function_privilege('anon','public.complete_order_refund_with_account(text,integer,text)','EXECUTE') then
    raise exception 'Refund completion grants changed';
  end if;
end;
$$;
