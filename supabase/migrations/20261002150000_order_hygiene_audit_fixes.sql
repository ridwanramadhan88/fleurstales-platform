-- Order hygiene fixes from the 2026-10-02 audit.
--
-- 1. Payment proofs: the Business OS shows "View proof" to Owner and Admin, but Storage
--    only let Finance read the files, so the button failed for them. Owner and Admin may
--    now read the proofs of orders they are already allowed to upload proofs for.
-- 2. Unpaid Storefront orders never expired, so they held their delivery slot forever.
--    A pg_cron job now cancels Storefront orders that are still pending verification,
--    unpaid and without proof once their scheduled time has passed or they are 48 hours
--    old.
-- 3. Anonymous checkout had no rate limit. New orders now spend a per-IP budget of 20
--    per hour; retries of an existing idempotency key are free.
-- 4. Review submission accepted the same question twice in place of another one.

-- 1. Payment proof reads -------------------------------------------------------------
drop policy if exists order_payment_proofs_storage_select on storage.objects;
create policy order_payment_proofs_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'order-payment-proofs'
  and (
    private.current_staff_role() = 'finance'
    or private.can_write_order_media_object(name)
  )
);

-- 2. Expire stale unpaid Storefront orders ---------------------------------------------
create or replace function private.expire_stale_storefront_orders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_reason text;
  v_count integer := 0;
  v_local_now timestamp := timezone('Asia/Jakarta', clock_timestamp());
begin
  for v_order in
    select o.*
    from public.orders o
    where o.source = 'customer_app'
      and o.status = 'pending_verification'
      and o.payment_status = 'unpaid'
      and nullif(trim(coalesce(o.payment_proof_url, '')), '') is null
      and (
        o.created_at < clock_timestamp() - interval '48 hours'
        or (o.schedule_date is not null and o.schedule_date + coalesce(o.schedule_time, time '23:59') < v_local_now)
      )
    order by o.created_at
    for update skip locked
  loop
    v_reason := case
      when v_order.schedule_date is not null
           and v_order.schedule_date + coalesce(v_order.schedule_time, time '23:59') < v_local_now
        then 'Automatically cancelled: the scheduled time passed before the order was confirmed and paid.'
      else 'Automatically cancelled: not confirmed and paid within 48 hours.'
    end;

    update public.orders
    set status = 'cancelled',
        cancellation_reason = v_reason,
        cancelled_by = 'System',
        cancelled_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = v_order.id;

    insert into public.order_activities(id, order_id, kind, description, actor, occurred_at)
    values (
      'activity_'||replace(gen_random_uuid()::text,'-',''),
      v_order.id,
      'status',
      v_reason,
      'System',
      clock_timestamp()
    );

    perform private.write_business_activity(
      'order', v_order.id, v_order.branch_id, 'cancelled',
      'Unpaid Storefront order cancelled automatically.',
      jsonb_build_object(
        'orderNumber', v_order.order_number,
        'fromStatus', 'pending_verification',
        'toStatus', 'cancelled',
        'reason', v_reason
      )
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.expire_stale_storefront_orders() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'expire-stale-storefront-orders';
select cron.schedule(
  'expire-stale-storefront-orders',
  '*/15 * * * *',
  $job$select private.expire_stale_storefront_orders()$job$
);

-- 3. Checkout rate limit ---------------------------------------------------------------
create or replace function private.consume_public_checkout_budget()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_ip text;
  v_hash text;
  v_window timestamptz := date_trunc('hour', clock_timestamp());
  v_count integer;
begin
  -- SQL smoke tests and trusted non-HTTP callers do not have request headers.
  if v_headers = '{}'::jsonb then
    return;
  end if;

  v_ip := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''),
    nullif(split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1), ''),
    'unknown'
  );
  v_hash := md5(v_ip || ':fleurstales-public-checkout');

  -- Shares the private per-IP counter table with order tracking; the salt above keeps
  -- the two budgets separate.
  insert into private.order_lookup_attempts as attempts (
    ip_hash, window_started_at, request_count, updated_at
  ) values (
    v_hash, v_window, 1, clock_timestamp()
  )
  on conflict (ip_hash, window_started_at) do update
    set request_count = attempts.request_count + 1,
        updated_at = clock_timestamp()
  returning request_count into v_count;

  if v_count > 20 then
    raise sqlstate 'PGRST' using
      message = json_build_object(
        'code', 'CHECKOUT_RATE_LIMITED',
        'message', 'Too many orders from this connection. Please try again later.'
      )::text,
      detail = json_build_object(
        'status', 429,
        'status_text', 'Too Many Requests'
      )::text;
  end if;
end;
$$;

revoke all on function private.consume_public_checkout_budget() from public, anon, authenticated;

create or replace function public.create_storefront_order(
  p_idempotency_key text,
  p_customer jsonb,
  p_branch_id text,
  p_fulfillment text,
  p_schedule_date date,
  p_schedule_time time without time zone,
  p_items jsonb,
  p_delivery_address text default null,
  p_delivery_instructions text default null,
  p_order_note text default null,
  p_greeting_message text default null,
  p_greeting_card_name text default null,
  p_payment_method text default 'transfer',
  p_promo_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_account jsonb;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_reward private.customer_review_rewards%rowtype;
  v_reward_discount bigint;
  v_is_dedup boolean;
  v_auto_promo jsonb;
  v_effective_promo_code text;
begin
  -- A retry of an order that already exists must still return it, so only new
  -- idempotency keys spend the per-IP checkout budget.
  if not exists (
    select 1 from public.orders o
    where o.storefront_idempotency_key = trim(coalesce(p_idempotency_key, ''))
  ) then
    perform private.consume_public_checkout_budget();
  end if;

  if lower(trim(coalesce(p_payment_method, 'transfer'))) <> 'transfer' then
    raise exception 'STOREFRONT_TRANSFER_ONLY' using errcode = '22023';
  end if;

  v_account := private.default_storefront_payment_account(p_branch_id);
  if v_account is null then
    raise exception 'STOREFRONT_PAYMENT_ACCOUNT_UNAVAILABLE' using errcode = '22023';
  end if;

  v_result := public.create_storefront_order_pre_cashflow(
    p_idempotency_key,p_customer,p_branch_id,p_fulfillment,p_schedule_date,p_schedule_time,
    p_items,p_delivery_address,p_delivery_instructions,p_order_note,p_greeting_message,
    p_greeting_card_name,'transfer',p_promo_code
  );
  v_is_dedup := coalesce((v_result->>'deduplicated')::boolean, false);

  select * into v_order from public.orders where id = v_result->>'orderId' for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;

  if not v_is_dedup then
    if nullif(trim(coalesce(p_promo_code, '')), '') is null
       and v_order.promo_code is null
       and v_order.discount_idr > 0 then
      v_auto_promo := private.resolve_voucher_discount(
        p_customer,
        v_order.items_subtotal_idr,
        null
      );
      if coalesce((v_auto_promo->>'promoAccepted')::boolean, false)
         and coalesce((v_auto_promo->>'discountIdr')::bigint, 0) = v_order.discount_idr then
        v_effective_promo_code := nullif(
          upper(trim(coalesce(v_auto_promo->>'promoCode', ''))),
          ''
        );
      end if;
    end if;

    update public.orders
    set payment_method = 'transfer',
        payment_account_snapshot = v_account,
        promo_code = coalesce(v_order.promo_code, v_effective_promo_code),
        updated_at = now()
    where id = v_order.id
    returning * into v_order;

    select * into v_reward
    from private.customer_review_rewards r
    where r.customer_id = v_order.customer_id
      and r.status = 'available'
      and r.min_order_idr <= v_order.items_subtotal_idr
    order by r.issued_at, r.id
    limit 1
    for update;

    if found then
      v_reward_discount := least(
        v_order.items_subtotal_idr,
        round(v_order.items_subtotal_idr * v_reward.percent_off / 100.0)::bigint
      );
      if v_reward_discount > v_order.discount_idr then
        update public.orders
        set discount_idr = v_reward_discount,
            total_idr = greatest(0, items_subtotal_idr - v_reward_discount + delivery_fee_idr),
            promo_code = null,
            review_reward_id = v_reward.id,
            updated_at = now()
        where id = v_order.id
        returning * into v_order;

        update private.customer_review_rewards
        set status = 'redeemed', redeemed_order_id = v_order.id, redeemed_at = now()
        where id = v_reward.id and status = 'available';
      end if;
    end if;
  end if;

  return private.order_idempotency_result(v_order, v_is_dedup);
end;
$function$;

revoke execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) from public, authenticated;
grant execute on function public.create_storefront_order(
  text,jsonb,text,text,date,time without time zone,jsonb,text,text,text,text,text,text,text
) to anon, service_role;

-- 4. One answer per review question -----------------------------------------------------
create or replace function public.submit_order_review(
  p_tracking_id text,
  p_answers jsonb,
  p_note text default null,
  p_profile jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracking_id uuid;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_review_id text := 'review_'||replace(gen_random_uuid()::text,'-','');
  v_item jsonb;
  v_question private.review_questions%rowtype;
  v_active_count integer;
  v_reward_settings private.review_reward_settings%rowtype;
  v_reward_id text;
  v_note text := nullif(trim(coalesce(p_note,'')),'');
  v_profile jsonb := coalesce(p_profile, '{}'::jsonb);
  v_name text;
  v_email text;
  v_birthday date;
  v_domicile text;
  v_age_range text;
  v_gender text;
  v_occupation text;
  v_acquisition_source text;
  v_promo_preferences text[] := '{}'::text[];
  v_survey_data jsonb;
begin
  perform private.consume_public_order_lookup_budget();
  begin
    v_tracking_id := p_tracking_id::uuid;
  exception when invalid_text_representation then
    raise exception 'TRACKING_LINK_INVALID' using errcode='22023';
  end;

  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'REVIEW_ANSWERS_INVALID' using errcode='22023';
  end if;
  if jsonb_typeof(v_profile) <> 'object' then
    raise exception 'REVIEW_PROFILE_INVALID' using errcode='22023';
  end if;
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'REVIEW_NOTE_TOO_LONG' using errcode='22023';
  end if;

  select * into v_order
  from public.orders
  where public_tracking_id = v_tracking_id
    and (tracking_expires_at is null or tracking_expires_at > now())
  for update;

  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.status not in ('delivered','picked_up') then raise exception 'ORDER_NOT_COMPLETED' using errcode='22023'; end if;
  if v_order.customer_id is null then raise exception 'CUSTOMER_ID_REQUIRED' using errcode='22023'; end if;
  if exists(select 1 from private.order_reviews where order_id=v_order.id) then
    raise exception 'ORDER_ALREADY_REVIEWED' using errcode='23505';
  end if;

  select * into v_customer
  from public.customers
  where id = v_order.customer_id
  for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND' using errcode='P0002'; end if;

  v_name := nullif(trim(v_profile->>'name'),'');
  v_email := nullif(lower(trim(v_profile->>'email')),'');
  v_domicile := nullif(trim(v_profile->>'domicile'),'');
  v_age_range := nullif(trim(v_profile->>'ageRange'),'');
  v_gender := nullif(trim(v_profile->>'gender'),'');
  v_occupation := nullif(trim(v_profile->>'occupation'),'');
  v_acquisition_source := nullif(trim(v_profile->>'acquisitionSource'),'');

  if v_name is not null and length(v_name) > 120 then raise exception 'REVIEW_NAME_INVALID' using errcode='22023'; end if;
  if v_email is not null and (length(v_email) > 254 or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'REVIEW_EMAIL_INVALID' using errcode='22023';
  end if;
  if nullif(trim(v_profile->>'birthday'),'') is not null then
    begin
      v_birthday := (v_profile->>'birthday')::date;
    exception when others then
      raise exception 'REVIEW_BIRTHDAY_INVALID' using errcode='22023';
    end;
    if v_birthday > current_date then raise exception 'REVIEW_BIRTHDAY_INVALID' using errcode='22023'; end if;
  end if;
  if v_domicile is not null and length(v_domicile) > 100 then raise exception 'REVIEW_DOMICILE_INVALID' using errcode='22023'; end if;
  if v_age_range is not null and v_age_range not in ('under_18','18_24','25_34','35_plus') then
    raise exception 'REVIEW_AGE_RANGE_INVALID' using errcode='22023';
  end if;
  if v_gender is not null and v_gender not in ('male','female') then
    raise exception 'REVIEW_GENDER_INVALID' using errcode='22023';
  end if;
  if v_occupation is not null and length(v_occupation) > 100 then raise exception 'REVIEW_OCCUPATION_INVALID' using errcode='22023'; end if;
  if v_acquisition_source is not null and length(v_acquisition_source) > 120 then raise exception 'REVIEW_ACQUISITION_INVALID' using errcode='22023'; end if;

  if v_profile ? 'promoPreferences' then
    if jsonb_typeof(v_profile->'promoPreferences') <> 'array' then
      raise exception 'REVIEW_PROMO_PREFERENCES_INVALID' using errcode='22023';
    end if;
    select coalesce(array_agg(value order by value), '{}'::text[])
    into v_promo_preferences
    from jsonb_array_elements_text(v_profile->'promoPreferences');
    if exists(
      select 1 from unnest(v_promo_preferences) p
      where p not in ('discount','cashback','bundling','flash_sale')
    ) then
      raise exception 'REVIEW_PROMO_PREFERENCES_INVALID' using errcode='22023';
    end if;
  else
    v_promo_preferences := v_customer.promo_preferences;
  end if;

  select count(*) into v_active_count from private.review_questions where is_active=true;
  -- Each active question must be answered exactly once. Counting rows alone let
  -- a client answer one question twice and skip another.
  if jsonb_array_length(p_answers) <> v_active_count
     or (
       select count(distinct nullif(trim(coalesce(a.value->>'questionId','')),''))
       from jsonb_array_elements(p_answers) a
     ) <> v_active_count then
    raise exception 'ALL_REVIEW_QUESTIONS_REQUIRED' using errcode='22023';
  end if;

  update public.customers
  set name = coalesce(v_name, name),
      email = coalesce(v_email, email),
      birthday = coalesce(v_birthday, birthday),
      domicile = coalesce(v_domicile, domicile),
      age_range = coalesce(v_age_range, age_range),
      gender = coalesce(v_gender, gender),
      occupation = coalesce(v_occupation, occupation),
      acquisition_source = coalesce(v_acquisition_source, acquisition_source),
      promo_preferences = coalesce(v_promo_preferences, promo_preferences),
      revision = revision + 1,
      updated_at = now()
  where id = v_order.customer_id
  returning * into v_customer;

  v_survey_data := jsonb_strip_nulls(jsonb_build_object(
    'name', v_customer.name,
    'whatsapp', v_customer.whatsapp_number,
    'email', v_customer.email,
    'birthday', v_customer.birthday,
    'domicile', v_customer.domicile,
    'ageRange', v_customer.age_range,
    'gender', v_customer.gender,
    'occupation', v_customer.occupation,
    'acquisitionSource', v_customer.acquisition_source,
    'promoPreferences', to_jsonb(v_customer.promo_preferences),
    'branchId', v_order.branch_id
  ));

  insert into private.order_reviews(id,order_id,order_number,customer_id,note,survey_data,submitted_at)
  values(v_review_id,v_order.id,v_order.order_number,v_order.customer_id,v_note,v_survey_data,now());

  for v_item in select value from jsonb_array_elements(p_answers) loop
    select * into v_question
    from private.review_questions
    where id=v_item->>'questionId' and is_active=true;
    if not found then raise exception 'REVIEW_QUESTION_INVALID' using errcode='22023'; end if;
    if coalesce((v_item->>'score')::integer,0) not between 1 and 5 then
      raise exception 'REVIEW_SCORE_INVALID' using errcode='22023';
    end if;
    insert into private.order_review_answers(review_id,question_id,question_snapshot,score)
    values(v_review_id,v_question.id,v_question.question,(v_item->>'score')::integer);
  end loop;

  select * into v_reward_settings from private.review_reward_settings where id='primary';
  if v_reward_settings.enabled then
    v_reward_id := 'review_reward_'||replace(gen_random_uuid()::text,'-','');
    insert into private.customer_review_rewards(
      id,customer_id,source_order_id,source_review_id,percent_off,min_order_idr,status,issued_at
    )
    values(
      v_reward_id,v_order.customer_id,v_order.id,v_review_id,
      v_reward_settings.percent_off,v_reward_settings.min_order_idr,'available',now()
    )
    on conflict(source_order_id) do nothing;
  end if;

  return jsonb_build_object(
    'reviewSubmitted',true,
    'reviewId',v_review_id,
    'reward',case when v_reward_id is null then null else jsonb_build_object(
      'id',v_reward_id,
      'percentOff',v_reward_settings.percent_off,
      'minOrderIdr',v_reward_settings.min_order_idr,
      'status','available'
    ) end
  );
end;
$$;

revoke execute on function public.submit_order_review(text,jsonb,text,jsonb) from public, authenticated;
grant execute on function public.submit_order_review(text,jsonb,text,jsonb) to anon, service_role;
