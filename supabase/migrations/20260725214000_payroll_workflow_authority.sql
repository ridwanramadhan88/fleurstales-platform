-- Fleurstales V3.2 Payroll authority
-- Payroll keeps the current OS aggregate shape for compatibility, but every
-- mutation now crosses a command-aware server boundary. HR cannot modify
-- Finance-owned review/payment fields, Finance cannot rewrite HR calculation
-- inputs, actor metadata is verified against the authenticated staff profile,
-- and final payroll payment creates the Finance ledger entry in the same DB
-- transaction.

begin;

create or replace function private.payroll_finance_owned_projection(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'employeePayrolls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e->>'id',
        'financeReviewedAt', e->'financeReviewedAt',
        'financeReviewedBy', e->'financeReviewedBy',
        'paidAt', e->'paidAt',
        'paidBy', e->'paidBy',
        'paymentMethod', e->'paymentMethod',
        'paymentReference', e->'paymentReference',
        'paymentNote', e->'paymentNote'
      ) order by e->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) e
    ), '[]'::jsonb),
    'payrollProposals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p->>'id',
        'financeDecisionAt', p->'financeDecisionAt',
        'financeDecisionBy', p->'financeDecisionBy',
        'financeNote', p->'financeNote',
        'paidAt', p->'paidAt',
        'paidBy', p->'paidBy',
        'paymentMethod', p->'paymentMethod',
        'paymentReference', p->'paymentReference',
        'paymentNote', p->'paymentNote'
      ) order by p->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'payrollProposals','[]'::jsonb)) p
    ), '[]'::jsonb),
    'financePayrollReviews', coalesce((
      select jsonb_agg(r order by r->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'payrollReviews','[]'::jsonb)) r
      where coalesce(r->>'decision','') <> 'resolved'
    ), '[]'::jsonb),
    'proposalReviews', coalesce(p_snapshot->'payrollProposalReviews','[]'::jsonb),
    'scheduleAdjustments', coalesce(p_snapshot->'payrollScheduleAdjustments','[]'::jsonb)
  )
$$;

create or replace function private.payroll_hr_owned_projection(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'compensations', coalesce(p_snapshot->'compensations','[]'::jsonb),
    'employeePayrolls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e->>'id',
        'payrollPeriodId', e->'payrollPeriodId',
        'employeeId', e->'employeeId',
        'employeeName', e->'employeeName',
        'employeeRole', e->'employeeRole',
        'compensationId', e->'compensationId',
        'baseSalaryIdr', e->'baseSalaryIdr',
        'positivePoints', e->'positivePoints',
        'negativePoints', e->'negativePoints',
        'netPoints', e->'netPoints',
        'bonusIdr', e->'bonusIdr',
        'finalPayrollIdr', e->'finalPayrollIdr',
        'hrAdjustmentIdr', e->'hrAdjustmentIdr',
        'hrAdjustmentReason', e->'hrAdjustmentReason',
        'pointEntries', e->'pointEntries',
        'generatedAt', e->'generatedAt',
        'generatedBy', e->'generatedBy',
        'submittedAt', e->'submittedAt',
        'submittedBy', e->'submittedBy'
      ) order by e->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) e
    ), '[]'::jsonb),
    'payrollProposals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p->>'id',
        'payrollPeriodId', p->'payrollPeriodId',
        'employeePayrollIds', p->'employeePayrollIds',
        'totalBaseSalaryIdr', p->'totalBaseSalaryIdr',
        'totalBonusIdr', p->'totalBonusIdr',
        'totalAdjustmentsIdr', p->'totalAdjustmentsIdr',
        'totalPayrollIdr', p->'totalPayrollIdr',
        'createdAt', p->'createdAt',
        'createdBy', p->'createdBy',
        'submittedAt', p->'submittedAt',
        'submittedBy', p->'submittedBy',
        'warnings', p->'warnings'
      ) order by p->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'payrollProposals','[]'::jsonb)) p
    ), '[]'::jsonb),
    'resolvedReviews', coalesce((
      select jsonb_agg(r order by r->>'id')
      from jsonb_array_elements(coalesce(p_snapshot->'payrollReviews','[]'::jsonb)) r
      where coalesce(r->>'decision','') = 'resolved'
    ), '[]'::jsonb)
  )
$$;

revoke execute on function private.payroll_finance_owned_projection(jsonb) from public, anon, authenticated;
revoke execute on function private.payroll_hr_owned_projection(jsonb) from public, anon, authenticated;

create or replace function private.validate_payroll_actor_metadata(
  p_previous jsonb,
  p_next jsonb,
  p_actor_name text,
  p_actor_role text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Any newly appended review record must identify the authenticated actor.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_next->'payrollReviews','[]'::jsonb)) r
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_previous->'payrollReviews','[]'::jsonb)) old
      where old->>'id' = r->>'id'
    )
    and (coalesce(r->>'actorName','') <> p_actor_name or coalesce(r->>'actorRole','') <> p_actor_role)
  ) then
    raise exception 'PAYROLL_FORGED_REVIEW_ACTOR' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_next->'payrollProposalReviews','[]'::jsonb)) r
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_previous->'payrollProposalReviews','[]'::jsonb)) old
      where old->>'id' = r->>'id'
    )
    and (coalesce(r->>'actorName','') <> p_actor_name or coalesce(r->>'actorRole','') <> p_actor_role)
  ) then
    raise exception 'PAYROLL_FORGED_PROPOSAL_REVIEW_ACTOR' using errcode = '42501';
  end if;

  -- Changed staff attribution fields must point to the authenticated staff member.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_next->'employeePayrolls','[]'::jsonb)) n
    left join lateral (
      select o from jsonb_array_elements(coalesce(p_previous->'employeePayrolls','[]'::jsonb)) o
      where o->>'id' = n->>'id' limit 1
    ) previous on true
    where (
      n->'generatedBy' is distinct from previous.o->'generatedBy'
      and coalesce(n->>'generatedBy','') <> p_actor_name
    ) or (
      n->'submittedBy' is distinct from previous.o->'submittedBy'
      and coalesce(n->>'submittedBy','') <> p_actor_name
    ) or (
      n->'financeReviewedBy' is distinct from previous.o->'financeReviewedBy'
      and coalesce(n->>'financeReviewedBy','') <> p_actor_name
    ) or (
      n->'paidBy' is distinct from previous.o->'paidBy'
      and coalesce(n->>'paidBy','') <> p_actor_name
    ) or (
      n->'resolvedBy' is distinct from previous.o->'resolvedBy'
      and coalesce(n->>'resolvedBy','') <> p_actor_name
    )
  ) then
    raise exception 'PAYROLL_FORGED_EMPLOYEE_ACTOR' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_next->'payrollProposals','[]'::jsonb)) n
    left join lateral (
      select o from jsonb_array_elements(coalesce(p_previous->'payrollProposals','[]'::jsonb)) o
      where o->>'id' = n->>'id' limit 1
    ) previous on true
    where (
      n->'createdBy' is distinct from previous.o->'createdBy'
      and coalesce(n->>'createdBy','') <> p_actor_name
    ) or (
      n->'submittedBy' is distinct from previous.o->'submittedBy'
      and coalesce(n->>'submittedBy','') <> p_actor_name
    ) or (
      n->'financeDecisionBy' is distinct from previous.o->'financeDecisionBy'
      and coalesce(n->>'financeDecisionBy','') <> p_actor_name
    ) or (
      n->'paidBy' is distinct from previous.o->'paidBy'
      and coalesce(n->>'paidBy','') <> p_actor_name
    )
  ) then
    raise exception 'PAYROLL_FORGED_PROPOSAL_ACTOR' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_next->'compensations','[]'::jsonb)) n
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_previous->'compensations','[]'::jsonb)) o
      where o->>'id' = n->>'id'
    )
    and coalesce(n->>'createdBy','') <> p_actor_name
  ) then
    raise exception 'PAYROLL_FORGED_COMPENSATION_ACTOR' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_next->'payrollScheduleAdjustments','[]'::jsonb)) n
    where not exists (
      select 1 from jsonb_array_elements(coalesce(p_previous->'payrollScheduleAdjustments','[]'::jsonb)) o
      where o->>'id' = n->>'id'
    )
    and (coalesce(n->>'changedBy','') <> p_actor_name or coalesce(n->>'changedByRole','') <> p_actor_role)
  ) then
    raise exception 'PAYROLL_FORGED_SCHEDULE_ACTOR' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function private.validate_payroll_actor_metadata(jsonb,jsonb,text,text) from public, anon, authenticated;

create or replace function private.apply_payroll_workflow_state(
  p_command text,
  p_expected_revision bigint,
  p_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state private.operational_domain_state%rowtype;
  v_finance private.operational_domain_state%rowtype;
  v_previous jsonb := '{}'::jsonb;
  v_profile public.staff_access_profiles%rowtype;
  v_actor_name text;
  v_next_revision bigint;
  v_is_hr_command boolean;
  v_is_finance_command boolean;
  v_required_capability text;
  v_proposal jsonb;
  v_period jsonb;
  v_finance_snapshot jsonb;
  v_transactions jsonb;
  v_transaction jsonb;
  v_payment_method text;
  v_period_label text;
  v_proposal_id text;
  v_period_id text;
  v_payment_date text;
  v_payment_reference text;
  v_amount bigint;
  v_idempotency_key text;
  v_allowed_keys text[];
  v_changed_key text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'INVALID_PAYROLL_STATE' using errcode = '22023';
  end if;

  select * into v_profile
  from public.staff_access_profiles
  where user_id = (select auth.uid()) and is_active = true
  limit 1;
  if not found then raise exception 'STAFF_PROFILE_REQUIRED' using errcode = '42501'; end if;
  v_actor_name := coalesce(nullif(trim(v_profile.display_name),''), v_profile.role);

  v_required_capability := case p_command
    when 'set_compensation' then 'settings.edit_payroll'
    when 'prepare' then 'hr.edit_payroll_proposal'
    when 'generate' then 'hr.create_payroll_proposal'
    when 'submit' then 'hr.create_payroll_proposal'
    when 'resolve_rejected' then 'hr.resolve_rejected_employee'
    when 'approve_employee' then 'finance.approve_employee_payroll'
    when 'reject_employee' then 'finance.reject_employee_payroll'
    when 'approve_all' then 'finance.approve_all_payroll'
    when 'record_payment' then 'finance.record_final_payment'
    when 'adjust_schedule' then 'finance.adjust_payroll_schedule'
    else null
  end;
  if v_required_capability is null then raise exception 'UNKNOWN_PAYROLL_COMMAND' using errcode = '22023'; end if;
  if not private.has_action_permission(v_required_capability) then
    raise exception 'PAYROLL_ACTION_FORBIDDEN:%', v_required_capability using errcode = '42501';
  end if;

  if p_command = 'set_compensation' and v_profile.role <> 'owner' then
    raise exception 'OWNER_REQUIRED_FOR_COMPENSATION' using errcode = '42501';
  end if;

  v_is_hr_command := p_command in ('set_compensation','prepare','generate','submit','resolve_rejected');
  v_is_finance_command := p_command in ('approve_employee','reject_employee','approve_all','record_payment','adjust_schedule');

  if v_is_hr_command and v_profile.role not in ('owner','hr') then
    raise exception 'HR_PAYROLL_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;
  if v_is_finance_command and v_profile.role not in ('owner','finance') then
    raise exception 'FINANCE_PAYROLL_COMMAND_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_state
  from private.operational_domain_state
  where domain = 'payroll'
  for update;

  if found then
    v_previous := v_state.snapshot;
    if v_state.revision <> p_expected_revision then
      raise exception 'REVISION_CONFLICT:payroll:expected=%:actual=%', p_expected_revision, v_state.revision
        using errcode = '40001';
    end if;
  else
    if coalesce(p_expected_revision,0) <> 0 then
      raise exception 'REVISION_CONFLICT:payroll:expected=%:actual=0', p_expected_revision using errcode = '40001';
    end if;
    v_previous := jsonb_build_object(
      'periods','[]'::jsonb,'compensations','[]'::jsonb,'employeePayrolls','[]'::jsonb,
      'payrollReviews','[]'::jsonb,'payrollProposals','[]'::jsonb,
      'payrollProposalReviews','[]'::jsonb,'payrollScheduleAdjustments','[]'::jsonb
    );
  end if;

  -- Each command may mutate only its own top-level payroll collections. This
  -- prevents an enabled action from carrying unrelated Payroll changes inside
  -- the otherwise compatible aggregate snapshot.
  v_allowed_keys := case p_command
    when 'set_compensation' then array['compensations']::text[]
    when 'prepare' then array['employeePayrolls']::text[]
    when 'generate' then array['employeePayrolls']::text[]
    when 'submit' then array['employeePayrolls','payrollProposals']::text[]
    when 'resolve_rejected' then array['employeePayrolls','payrollProposals','payrollReviews']::text[]
    when 'approve_employee' then array['employeePayrolls','payrollProposals','payrollReviews']::text[]
    when 'reject_employee' then array['employeePayrolls','payrollProposals','payrollReviews']::text[]
    when 'approve_all' then array['employeePayrolls','payrollProposals','payrollProposalReviews']::text[]
    when 'record_payment' then array['employeePayrolls','payrollProposals','payrollProposalReviews']::text[]
    when 'adjust_schedule' then array['periods','payrollScheduleAdjustments']::text[]
    else array[]::text[]
  end;

  for v_changed_key in
    select distinct k
    from jsonb_object_keys(coalesce(v_previous,'{}'::jsonb) || coalesce(p_snapshot,'{}'::jsonb)) as keys(k)
  loop
    if not (v_changed_key = any(v_allowed_keys))
      and (v_previous->v_changed_key) is distinct from (p_snapshot->v_changed_key)
    then
      raise exception 'PAYROLL_COMMAND_SCOPE_VIOLATION:%:%', p_command, v_changed_key using errcode='42501';
    end if;
  end loop;

  perform private.validate_payroll_actor_metadata(v_previous, p_snapshot, v_actor_name, v_profile.role);

  -- HR commands cannot rewrite Finance review/payment history. Owner follows
  -- the same boundary while executing an HR command, avoiding accidental
  -- cross-department changes in one UI save.
  if v_is_hr_command and p_command <> 'set_compensation'
    and private.payroll_finance_owned_projection(v_previous) is distinct from private.payroll_finance_owned_projection(p_snapshot)
  then
    raise exception 'PAYROLL_HR_CANNOT_MUTATE_FINANCE_FIELDS' using errcode = '42501';
  end if;

  -- Finance commands cannot rewrite compensation, calculations, HR adjustments,
  -- submission metadata, or HR resolution history.
  if v_is_finance_command
    and private.payroll_hr_owned_projection(v_previous) is distinct from private.payroll_hr_owned_projection(p_snapshot)
  then
    -- Schedule adjustment legitimately changes periods but periods are not part
    -- of the protected HR projection; all HR-owned draft/proposal fields remain fixed.
    raise exception 'PAYROLL_FINANCE_CANNOT_MUTATE_HR_FIELDS' using errcode = '42501';
  end if;

  -- Command-specific status invariants. This prevents callers from using one
  -- enabled capability to smuggle an unrelated workflow transition.
  if p_command in ('prepare','generate','set_compensation') and exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) n
    left join lateral (
      select o from jsonb_array_elements(coalesce(v_previous->'employeePayrolls','[]'::jsonb)) o where o->>'id'=n->>'id' limit 1
    ) old on true
    where old.o is not null
      and n->>'status' is distinct from old.o->>'status'
      and not (old.o->>'status'='finance_rejected' and n->>'status'='draft')
  ) then raise exception 'INVALID_PAYROLL_PREPARATION_STATUS_CHANGE' using errcode='22023'; end if;

  if p_command = 'submit' and exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) n
    left join lateral (
      select o from jsonb_array_elements(coalesce(v_previous->'employeePayrolls','[]'::jsonb)) o where o->>'id'=n->>'id' limit 1
    ) old on true
    where old.o is not null
      and n->>'status' is distinct from old.o->>'status'
      and not (old.o->>'status' in ('draft','finance_rejected') and n->>'status'='pending_finance_review')
  ) then raise exception 'INVALID_PAYROLL_SUBMISSION_STATUS_CHANGE' using errcode='22023'; end if;

  if p_command in ('approve_employee','approve_all') and exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) n
    left join lateral (
      select o from jsonb_array_elements(coalesce(v_previous->'employeePayrolls','[]'::jsonb)) o where o->>'id'=n->>'id' limit 1
    ) old on true
    where old.o is not null
      and n->>'status' is distinct from old.o->>'status'
      and not (old.o->>'status'='pending_finance_review' and n->>'status'='finance_verified')
  ) then raise exception 'INVALID_PAYROLL_APPROVAL_STATUS_CHANGE' using errcode='22023'; end if;

  if p_command = 'reject_employee' and exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) n
    left join lateral (
      select o from jsonb_array_elements(coalesce(v_previous->'employeePayrolls','[]'::jsonb)) o where o->>'id'=n->>'id' limit 1
    ) old on true
    where old.o is not null
      and n->>'status' is distinct from old.o->>'status'
      and not (old.o->>'status'='pending_finance_review' and n->>'status'='finance_rejected')
  ) then raise exception 'INVALID_PAYROLL_REJECTION_STATUS_CHANGE' using errcode='22023'; end if;

  if p_command = 'resolve_rejected' and exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) n
    left join lateral (
      select o from jsonb_array_elements(coalesce(v_previous->'employeePayrolls','[]'::jsonb)) o where o->>'id'=n->>'id' limit 1
    ) old on true
    where old.o is not null
      and n->>'status' is distinct from old.o->>'status'
      and not (old.o->>'status'='finance_rejected' and n->>'status'='resolved')
  ) then raise exception 'INVALID_PAYROLL_RESOLUTION_STATUS_CHANGE' using errcode='22023'; end if;

  if p_command = 'record_payment' and exists (
    select 1
    from jsonb_array_elements(coalesce(p_snapshot->'employeePayrolls','[]'::jsonb)) n
    left join lateral (
      select o from jsonb_array_elements(coalesce(v_previous->'employeePayrolls','[]'::jsonb)) o where o->>'id'=n->>'id' limit 1
    ) old on true
    where old.o is not null
      and n->>'status' is distinct from old.o->>'status'
      and not (old.o->>'status'='finance_verified' and n->>'status'='paid')
  ) then raise exception 'INVALID_PAYROLL_PAYMENT_STATUS_CHANGE' using errcode='22023'; end if;

  v_next_revision := coalesce(v_state.revision,0) + 1;
  insert into private.operational_domain_state(domain, revision, snapshot, updated_by, updated_at)
  values ('payroll', v_next_revision, p_snapshot, (select auth.uid()), now())
  on conflict(domain) do update
  set revision = excluded.revision,
      snapshot = excluded.snapshot,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  -- Final payroll payment and its Finance expense are one database transaction.
  if p_command = 'record_payment' then
    select p into v_proposal
    from jsonb_array_elements(coalesce(p_snapshot->'payrollProposals','[]'::jsonb)) p
    where p->>'status' = 'paid'
      and not exists (
        select 1 from jsonb_array_elements(coalesce(v_previous->'payrollProposals','[]'::jsonb)) old
        where old->>'id'=p->>'id' and old->>'status'='paid'
      )
    limit 1;
    if v_proposal is null then raise exception 'PAID_PAYROLL_PROPOSAL_REQUIRED' using errcode='22023'; end if;

    v_proposal_id := v_proposal->>'id';
    v_period_id := v_proposal->>'payrollPeriodId';
    v_payment_date := v_proposal->>'paidAt';
    v_payment_reference := nullif(trim(coalesce(v_proposal->>'paymentReference','')), '');
    v_amount := coalesce((v_proposal->>'totalPayrollIdr')::bigint,0);
    if v_payment_date is null or v_payment_reference is null or v_amount <= 0 then
      raise exception 'INVALID_PAYROLL_PAYMENT_DETAILS' using errcode='22023';
    end if;

    select p into v_period
    from jsonb_array_elements(coalesce(p_snapshot->'periods','[]'::jsonb)) p
    where p->>'id'=v_period_id limit 1;
    v_period_label := case when v_period is null then v_period_id else coalesce(v_period->>'periodStart','') || ' - ' || coalesce(v_period->>'periodEnd','') end;
    v_payment_method := case
      when lower(coalesce(v_proposal->>'paymentMethod','')) like '%cash%' then 'cash'
      when lower(coalesce(v_proposal->>'paymentMethod','')) like '%card%' then 'card'
      when lower(coalesce(v_proposal->>'paymentMethod','')) like '%transfer%' or lower(coalesce(v_proposal->>'paymentMethod','')) like '%bank%' then 'transfer'
      else 'other'
    end;
    v_idempotency_key := 'payroll-expense:' || v_proposal_id;

    select * into v_finance
    from private.operational_domain_state
    where domain='finance'
    for update;
    v_finance_snapshot := coalesce(v_finance.snapshot, jsonb_build_object('transactions','[]'::jsonb,'customCategories','[]'::jsonb,'categoryOverrides','[]'::jsonb));
    v_transactions := coalesce(v_finance_snapshot->'transactions','[]'::jsonb);

    if not exists (select 1 from jsonb_array_elements(v_transactions) t where t->>'idempotencyKey'=v_idempotency_key) then
      v_transaction := jsonb_build_object(
        'id', 'txn-payroll-' || replace(v_proposal_id,'payroll-proposal-',''),
        'type','expense','category','payroll','branch','All','scope','company',
        'amount',v_amount,'method',v_payment_method,'status','verified',
        'name','Payroll ' || v_period_label,
        'description','Payroll payment · ' || v_period_label,
        'payrollProposalId',v_proposal_id,'payrollPeriodId',v_period_id,
        'reference',v_payment_reference,'source','payroll','entryMode','automatic',
        'transactionDate',v_payment_date || 'T12:00:00+07:00',
        'groupType','payroll_cycle','groupKey',v_period_id,'groupLabel',v_period_label,
        'sourceEventId',v_proposal_id,'idempotencyKey',v_idempotency_key,
        'isSystemGenerated',true,'actor',v_actor_name,'createdAt',now(),'updatedAt',now()
      );
      v_finance_snapshot := jsonb_set(v_finance_snapshot,'{transactions}',jsonb_build_array(v_transaction) || v_transactions,true);
      insert into private.operational_domain_state(domain,revision,snapshot,updated_by,updated_at)
      values ('finance',coalesce(v_finance.revision,0)+1,v_finance_snapshot,(select auth.uid()),now())
      on conflict(domain) do update set
        revision=excluded.revision,snapshot=excluded.snapshot,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
    end if;
  end if;

  perform private.write_audit_event(
    'payroll.' || p_command, 'payroll', 'primary', 'succeeded',
    coalesce(v_state.revision,0), v_next_revision, v_previous, p_snapshot
  );

  perform private.write_business_activity(
    'payroll', 'primary', null, p_command,
    case p_command
      when 'submit' then 'Payroll submitted to Finance'
      when 'reject_employee' then 'Payroll item returned to HR'
      when 'approve_employee' then 'Payroll item approved by Finance'
      when 'approve_all' then 'Payroll approved by Finance'
      when 'record_payment' then 'Payroll payment recorded'
      when 'resolve_rejected' then 'Rejected payroll item resolved by HR'
      when 'adjust_schedule' then 'Payroll schedule adjusted'
      else 'Payroll updated'
    end,
    jsonb_build_object('command', p_command, 'revision', v_next_revision)
  );

  if p_command = 'submit' then
    perform private.notify_roles(
      array['owner','finance'], null, 'payroll_submitted', 'warning',
      'Payroll ready for review', 'HR submitted payroll for Finance review.',
      'payroll', 'primary', 'finance_payroll', null
    );
  elsif p_command = 'reject_employee' then
    perform private.notify_roles(
      array['owner','hr'], null, 'payroll_rejected', 'warning',
      'Payroll needs correction', 'Finance returned a payroll item to HR.',
      'payroll', 'primary', 'hr_payroll', null
    );
  elsif p_command = 'approve_all' then
    perform private.notify_roles(
      array['owner','hr'], null, 'payroll_approved', 'info',
      'Payroll approved', 'Finance approved the payroll cycle.',
      'payroll', 'primary', 'hr_payroll', null
    );
  elsif p_command = 'record_payment' then
    perform private.notify_roles(
      array['owner','hr'], null, 'payroll_paid', 'info',
      'Payroll paid', 'Finance recorded the final payroll payment.',
      'payroll', 'primary', 'hr_payroll', null
    );
  end if;

  return jsonb_build_object('domain','payroll','revision',v_next_revision,'snapshot',p_snapshot,'updatedAt',now());
end;
$$;

revoke execute on function private.apply_payroll_workflow_state(text,bigint,jsonb) from public, anon, authenticated;

-- Thin named RPCs make the client contract explicit and keep action-specific
-- permissions visible in schema review/tests.
create or replace function public.payroll_set_compensation(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('set_compensation',p_expected_revision,p_snapshot) $$;
create or replace function public.payroll_prepare(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('prepare',p_expected_revision,p_snapshot) $$;
create or replace function public.payroll_generate(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('generate',p_expected_revision,p_snapshot) $$;
create or replace function public.payroll_submit(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('submit',p_expected_revision,p_snapshot) $$;
create or replace function public.payroll_resolve_rejected(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('resolve_rejected',p_expected_revision,p_snapshot) $$;
create or replace function public.payroll_approve_employee(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('approve_employee',p_expected_revision,p_snapshot) $$;
create or replace function public.payroll_reject_employee(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('reject_employee',p_expected_revision,p_snapshot) $$;
create or replace function public.payroll_approve_all(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('approve_all',p_expected_revision,p_snapshot) $$;
create or replace function public.payroll_record_payment(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('record_payment',p_expected_revision,p_snapshot) $$;
create or replace function public.payroll_adjust_schedule(p_expected_revision bigint,p_snapshot jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.apply_payroll_workflow_state('adjust_schedule',p_expected_revision,p_snapshot) $$;

revoke execute on function public.payroll_set_compensation(bigint,jsonb) from public, anon;
revoke execute on function public.payroll_prepare(bigint,jsonb) from public, anon;
revoke execute on function public.payroll_generate(bigint,jsonb) from public, anon;
revoke execute on function public.payroll_submit(bigint,jsonb) from public, anon;
revoke execute on function public.payroll_resolve_rejected(bigint,jsonb) from public, anon;
revoke execute on function public.payroll_approve_employee(bigint,jsonb) from public, anon;
revoke execute on function public.payroll_reject_employee(bigint,jsonb) from public, anon;
revoke execute on function public.payroll_approve_all(bigint,jsonb) from public, anon;
revoke execute on function public.payroll_record_payment(bigint,jsonb) from public, anon;
revoke execute on function public.payroll_adjust_schedule(bigint,jsonb) from public, anon;

grant execute on function public.payroll_set_compensation(bigint,jsonb) to authenticated;
grant execute on function public.payroll_prepare(bigint,jsonb) to authenticated;
grant execute on function public.payroll_generate(bigint,jsonb) to authenticated;
grant execute on function public.payroll_submit(bigint,jsonb) to authenticated;
grant execute on function public.payroll_resolve_rejected(bigint,jsonb) to authenticated;
grant execute on function public.payroll_approve_employee(bigint,jsonb) to authenticated;
grant execute on function public.payroll_reject_employee(bigint,jsonb) to authenticated;
grant execute on function public.payroll_approve_all(bigint,jsonb) to authenticated;
grant execute on function public.payroll_record_payment(bigint,jsonb) to authenticated;
grant execute on function public.payroll_adjust_schedule(bigint,jsonb) to authenticated;

commit;
