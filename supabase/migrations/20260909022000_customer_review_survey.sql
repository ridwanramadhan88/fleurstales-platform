-- Expand completed-order reviews into a structured customer feedback survey.
-- Existing review rewards and configurable rating questions remain authoritative.

begin;

alter table public.customers
  add column if not exists domicile text,
  add column if not exists age_range text,
  add column if not exists gender text,
  add column if not exists occupation text,
  add column if not exists acquisition_source text,
  add column if not exists promo_preferences text[] not null default '{}'::text[];

alter table private.order_reviews
  add column if not exists survey_data jsonb not null default '{}'::jsonb;

-- Keep the built-in review template at five concise rating questions.
-- Existing custom/admin-created questions are not overwritten.
update private.review_questions
set question = 'Product quality', updated_at = now()
where id = 'review_product_quality' and question = 'Kualitas produk';

update private.review_questions
set question = 'Service', updated_at = now()
where id = 'review_service' and question = 'Pelayanan';

update private.review_questions
set question = 'Delivery / Pickup', updated_at = now()
where id = 'review_fulfillment' and question = 'Pengiriman / Pickup';

insert into private.review_questions(id, question, display_order, is_active)
values
  ('review_whatsapp_response', 'WhatsApp response time', 40, true),
  ('review_recommendation', 'How likely are you to recommend Fleurstales?', 50, true)
on conflict (id) do nothing;

-- New structured review submission. The opaque tracking id remains the only
-- public bearer credential and reviews are still limited to completed orders.
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
  if jsonb_array_length(p_answers) <> v_active_count then
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

-- Preserve the previous three-argument contract for older deployed clients.
create or replace function public.submit_order_review(
  p_tracking_id text,
  p_answers jsonb,
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.submit_order_review(p_tracking_id,p_answers,p_note,'{}'::jsonb)
$$;
revoke execute on function public.submit_order_review(text,jsonb,text) from public, authenticated;
grant execute on function public.submit_order_review(text,jsonb,text) to anon, service_role;

create or replace function public.get_order_public_status(p_tracking_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracking_id uuid;
  v_result jsonb;
begin
  perform private.consume_public_order_lookup_budget();
  begin
    v_tracking_id := p_tracking_id::uuid;
  exception when invalid_text_representation then
    return null;
  end;

  select jsonb_build_object(
    'orderNumber',o.order_number,
    'status',o.status,
    'fulfillment',o.fulfillment,
    'branchId',o.branch_id,
    'branchName',b.name,
    'branchAddress',b.address,
    'customerName',coalesce(c.name,o.customer_name_snapshot),
    'customerWhatsapp',coalesce(c.whatsapp_number,o.customer_whatsapp_snapshot),
    'customerEmail',coalesce(c.email,o.customer_email_snapshot),
    'customerBirthday',c.birthday,
    'customerProfile',jsonb_strip_nulls(jsonb_build_object(
      'domicile',c.domicile,
      'ageRange',c.age_range,
      'gender',c.gender,
      'occupation',c.occupation,
      'acquisitionSource',c.acquisition_source,
      'promoPreferences',to_jsonb(c.promo_preferences)
    )),
    'contactWhatsapp',sp.whatsapp,
    'deliveryAddress',o.delivery_address,
    'deliveryInstructions',o.delivery_instructions,
    'scheduleDate',o.schedule_date,
    'scheduleTime',o.schedule_time,
    'requestedPickupDate',o.requested_pickup_date,
    'requestedPickupTime',o.requested_pickup_time,
    'paymentStatus',o.payment_status,
    'paymentMethod',o.payment_method,
    'paymentAccountSnapshot',o.payment_account_snapshot,
    'itemsSubtotalIdr',o.items_subtotal_idr,
    'deliveryFeeIdr',o.delivery_fee_idr,
    'discountIdr',o.discount_idr,
    'totalIdr',o.total_idr,
    'cancellationReason',o.cancellation_reason,
    'finishPhotoUrl',o.finish_photo_url,
    'reviewSubmitted',exists(select 1 from private.order_reviews r where r.order_id=o.id),
    'reviewQuestions',case
      when o.status in ('delivered','picked_up')
        and not exists(select 1 from private.order_reviews r where r.order_id=o.id)
      then coalesce((
        select jsonb_agg(
          jsonb_build_object('id',q.id,'question',q.question,'displayOrder',q.display_order)
          order by q.display_order,q.id
        )
        from private.review_questions q where q.is_active=true
      ),'[]'::jsonb)
      else '[]'::jsonb
    end,
    'review',(select jsonb_build_object(
      'note',r.note,
      'submittedAt',r.submitted_at,
      'surveyData',r.survey_data,
      'answers',coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'questionId',a.question_id,
            'question',a.question_snapshot,
            'score',a.score
          ) order by a.question_id
        )
        from private.order_review_answers a where a.review_id=r.id
      ),'[]'::jsonb)
    ) from private.order_reviews r where r.order_id=o.id limit 1),
    'reviewReward',(select jsonb_build_object(
      'percentOff',rw.percent_off,
      'minOrderIdr',rw.min_order_idr,
      'status',rw.status,
      'issuedAt',rw.issued_at,
      'redeemedAt',rw.redeemed_at
    ) from private.customer_review_rewards rw where rw.source_order_id=o.id limit 1),
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name',i.product_name_snapshot,
          'variant',i.variant_size_snapshot,
          'quantity',i.quantity,
          'unitPriceIdr',i.unit_price_idr
        ) order by i.created_at,i.id
      )
      from public.order_items i where i.order_id=o.id
    ),'[]'::jsonb)
  ) into v_result
  from public.orders o
  left join public.customers c on c.id=o.customer_id
  left join public.branches b on b.id=o.branch_id
  left join public.store_profile sp on sp.id='primary'
  where o.public_tracking_id=v_tracking_id
    and (o.tracking_expires_at is null or o.tracking_expires_at > now())
  limit 1;

  return v_result;
end;
$$;
revoke execute on function public.get_order_public_status(text) from public, authenticated;
grant execute on function public.get_order_public_status(text) to anon, service_role;

commit;
