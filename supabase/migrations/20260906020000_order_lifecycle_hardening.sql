-- Harden Order Lifecycle & Progress UX before release.
-- Universal secure tracking, terminal-based expiry, branch-aware media storage,
-- private transfer proofs, and server-side lifecycle invariants.

begin;

alter table public.orders
  add column if not exists terminal_at timestamptz,
  add column if not exists tracking_expires_at timestamptz;

-- Existing terminal orders receive a deterministic expiry window from the best
-- terminal timestamp already available. Active orders never expire.
update public.orders
set terminal_at = coalesce(
      terminal_at,
      case
        when status in ('delivered','picked_up') then completed_at
        when status = 'cancelled' then cancelled_at
        else null
      end,
      updated_at,
      created_at
    ),
    tracking_expires_at = coalesce(
      tracking_expires_at,
      coalesce(
        terminal_at,
        case
          when status in ('delivered','picked_up') then completed_at
          when status = 'cancelled' then cancelled_at
          else null
        end,
        updated_at,
        created_at
      ) + interval '14 days'
    )
where status in ('delivered','picked_up','cancelled','failed');

update public.orders
set terminal_at = null,
    tracking_expires_at = null
where status not in ('delivered','picked_up','cancelled','failed');

-- Payment proof is internal Finance evidence. Finished-order photos remain
-- public because the customer tracking page intentionally displays them.
update storage.buckets
set public = false,
    file_size_limit = 307200,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'order-payment-proofs';

update storage.buckets
set public = true,
    file_size_limit = 102400,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'order-finish-photos';

-- Object keys are <order-id>/<kind>-<nonce>.jpg. The order id in the first
-- path segment ties Storage authorization to the authoritative order row.
create or replace function private.can_write_order_media_object(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = split_part(coalesce(p_object_name,''), '/', 1)
      and private.current_staff_role() in ('owner','admin')
      and private.has_action_permission('orders.advance_status')
      and (
        private.current_staff_role() = 'owner'
        or (
          private.current_staff_role() = 'admin'
          and o.branch_id = private.current_staff_branch_id()
        )
      )
  )
$$;
revoke execute on function private.can_write_order_media_object(text) from public, anon, authenticated;

drop policy if exists order_finish_photos_storage_insert on storage.objects;
drop policy if exists order_finish_photos_storage_update on storage.objects;
drop policy if exists order_finish_photos_storage_delete on storage.objects;
drop policy if exists order_finish_photos_storage_select on storage.objects;
drop policy if exists order_payment_proofs_storage_insert on storage.objects;
drop policy if exists order_payment_proofs_storage_update on storage.objects;
drop policy if exists order_payment_proofs_storage_delete on storage.objects;
drop policy if exists order_payment_proofs_storage_select on storage.objects;

create policy order_finish_photos_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'order-finish-photos'
  and private.can_write_order_media_object(name)
);

create policy order_finish_photos_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'order-finish-photos'
  and private.can_write_order_media_object(name)
);

create policy order_payment_proofs_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'order-payment-proofs'
  and private.can_write_order_media_object(name)
);

create policy order_payment_proofs_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'order-payment-proofs'
  and private.can_write_order_media_object(name)
);

-- Finance can inspect transfer evidence through short-lived signed URLs. The
-- bucket itself is private and is never exposed through public tracking.
create policy order_payment_proofs_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'order-payment-proofs'
  and private.current_staff_role() = 'finance'
);

-- One server-side lifecycle authority protects every caller, including stale
-- clients and direct RPC calls. It also stamps the 14-day terminal window.
create or replace function private.enforce_order_lifecycle_media()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_expected_finish_fragment text;
  v_expected_proof_prefix text;
begin
  v_expected_finish_fragment := '/storage/v1/object/public/order-finish-photos/' || new.id || '/';
  v_expected_proof_prefix := new.id || '/proof-';

  if new.finish_photo_url is not null
     and trim(new.finish_photo_url) <> ''
     and position(v_expected_finish_fragment in new.finish_photo_url) = 0 then
    raise exception 'FINISH_PHOTO_OBJECT_INVALID' using errcode='22023';
  end if;

  if new.payment_proof_url is not null
     and trim(new.payment_proof_url) <> ''
     and new.payment_proof_url not like v_expected_proof_prefix || '%.jpg' then
    raise exception 'PAYMENT_PROOF_OBJECT_INVALID' using errcode='22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'ready'
       and old.status is distinct from 'ready'
       and nullif(trim(coalesce(new.finish_photo_url,'')),'') is null then
      raise exception 'FINISH_PHOTO_REQUIRED_BEFORE_READY' using errcode='22023';
    end if;

    if new.payment_method = 'transfer'
       and (
         (new.payment_status = 'paid' and old.payment_status is distinct from 'paid')
         or (new.status = 'processing' and old.status is distinct from 'processing')
       )
       and nullif(trim(coalesce(new.payment_proof_url,'')),'') is null then
      raise exception 'PAYMENT_PROOF_REQUIRED_FOR_TRANSFER' using errcode='22023';
    end if;
  end if;

  if new.status in ('delivered','picked_up','cancelled','failed') then
    if tg_op = 'INSERT'
       or old.status not in ('delivered','picked_up','cancelled','failed')
       or new.terminal_at is null then
      new.terminal_at := coalesce(
        new.terminal_at,
        case
          when new.status in ('delivered','picked_up') then new.completed_at
          when new.status = 'cancelled' then new.cancelled_at
          else null
        end,
        v_now
      );
      new.tracking_expires_at := new.terminal_at + interval '14 days';
    elsif new.tracking_expires_at is null then
      new.tracking_expires_at := new.terminal_at + interval '14 days';
    end if;
  else
    new.terminal_at := null;
    new.tracking_expires_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists orders_lifecycle_media_guard on public.orders;
create trigger orders_lifecycle_media_guard
before insert or update on public.orders
for each row execute function private.enforce_order_lifecycle_media();

-- Attach the customer-visible finish photo through an authoritative order
-- mutation. The upload happens first; if this RPC fails the client removes the
-- object. Once this succeeds the object is referenced by the order even if the
-- later Ready transition is rejected for another reason.
create or replace function public.attach_order_finish_photo(
  p_order_id text,
  p_expected_revision integer,
  p_finish_photo_url text,
  p_uploaded_by text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_role text := private.current_staff_role();
  v_now timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if v_role not in ('owner','admin') or not private.has_action_permission('orders.advance_status') then
    raise exception 'FINISH_PHOTO_NOT_PERMITTED' using errcode='42501';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_order.revision using errcode='40001';
  end if;
  if v_order.status <> 'processing' then
    raise exception 'FINISH_PHOTO_REQUIRES_PROCESSING_ORDER' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_finish_photo_url,'')),'') is null
     or position('/storage/v1/object/public/order-finish-photos/' || v_order.id || '/' in p_finish_photo_url) = 0 then
    raise exception 'FINISH_PHOTO_OBJECT_INVALID' using errcode='22023';
  end if;

  update public.orders
  set finish_photo_url=p_finish_photo_url,
      finish_photo_uploaded_by=nullif(trim(coalesce(p_uploaded_by,'')),''),
      finish_photo_uploaded_at=v_now,
      revision=revision+1,
      updated_at=v_now
  where id=v_order.id
  returning * into v_order;

  return jsonb_build_object(
    'orderId',v_order.id,
    'orderNumber',v_order.order_number,
    'revision',v_order.revision,
    'finishPhotoUrl',v_order.finish_photo_url,
    'finishPhotoUploadedAt',v_order.finish_photo_uploaded_at
  );
end;
$$;
revoke execute on function public.attach_order_finish_photo(text,integer,text,text) from public, anon;
grant execute on function public.attach_order_finish_photo(text,integer,text,text) to authenticated, service_role;

-- Atomic Process Order wrapper. For transfer orders the private Storage object
-- path is attached in the same database transaction as payment verification,
-- Finance Money In, florist assignment, and the move to Processing.
create or replace function public.process_order_for_production_with_proof(
  p_order_id text,
  p_expected_revision integer,
  p_finance_account_id text,
  p_florist_employee_id text,
  p_assignment_date date,
  p_assignment_time time without time zone default null,
  p_allow_schedule_override boolean default false,
  p_scheduled_branch_id text default null,
  p_shift_start time without time zone default null,
  p_shift_end time without time zone default null,
  p_payment_proof_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_proof text := nullif(trim(coalesce(p_payment_proof_path,'')),'');
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT expected=%, actual=%',p_expected_revision,v_order.revision using errcode='40001';
  end if;

  if v_order.payment_method = 'transfer' then
    if v_proof is null or v_proof not like v_order.id || '/proof-%.jpg' then
      raise exception 'PAYMENT_PROOF_REQUIRED_FOR_TRANSFER' using errcode='22023';
    end if;
    update public.orders
    set payment_proof_url=v_proof,
        updated_at=clock_timestamp()
    where id=v_order.id;
  elsif v_order.payment_method = 'cash' then
    v_proof := null;
  else
    raise exception 'PAYMENT_METHOD_REQUIRED' using errcode='22023';
  end if;

  v_result := public.process_order_for_production(
    p_order_id,
    p_expected_revision,
    p_finance_account_id,
    p_florist_employee_id,
    p_assignment_date,
    p_assignment_time,
    p_allow_schedule_override,
    p_scheduled_branch_id,
    p_shift_start,
    p_shift_end
  );

  return v_result || jsonb_build_object('paymentProofPath',v_proof);
end;
$$;
revoke execute on function public.process_order_for_production_with_proof(
  text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone,text
) from public, anon;
grant execute on function public.process_order_for_production_with_proof(
  text,integer,text,text,date,time without time zone,boolean,text,time without time zone,time without time zone,text
) to authenticated, service_role;

-- Universal secure lookup. Source channel is not an authorization boundary;
-- the opaque tracking UUID + matching WhatsApp number is the customer gate.
create or replace function public.verify_order_tracking_access(
  p_order_number text,
  p_whatsapp_number text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  perform private.consume_public_order_lookup_budget();
  select * into v_order
  from public.orders o
  where upper(o.order_number)=upper(trim(p_order_number))
    and private.normalize_whatsapp(o.customer_whatsapp_snapshot)=private.normalize_whatsapp(p_whatsapp_number)
    and (o.tracking_expires_at is null or o.tracking_expires_at > now())
  limit 1;
  if not found then return null; end if;
  return jsonb_build_object('orderNumber',v_order.order_number,'publicTrackingId',v_order.public_tracking_id::text);
end;
$$;
revoke execute on function public.verify_order_tracking_access(text,text) from public, authenticated;
grant execute on function public.verify_order_tracking_access(text,text) to anon, service_role;

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
  begin v_tracking_id:=p_tracking_id::uuid; exception when invalid_text_representation then return null; end;

  select jsonb_build_object(
    'orderNumber',o.order_number,
    'status',o.status,
    'fulfillment',o.fulfillment,
    'branchId',o.branch_id,
    'branchName',b.name,
    'branchAddress',b.address,
    'customerName',o.customer_name_snapshot,
    'customerWhatsapp',o.customer_whatsapp_snapshot,
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
    'reviewQuestions',case when o.status in ('delivered','picked_up') and not exists(select 1 from private.order_reviews r where r.order_id=o.id) then
      coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'displayOrder',q.display_order) order by q.display_order,q.id) from private.review_questions q where q.is_active=true),'[]'::jsonb)
      else '[]'::jsonb end,
    'review',(select jsonb_build_object(
      'note',r.note,'submittedAt',r.submitted_at,
      'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'question',a.question_snapshot,'score',a.score) order by a.question_id) from private.order_review_answers a where a.review_id=r.id),'[]'::jsonb)
    ) from private.order_reviews r where r.order_id=o.id limit 1),
    'reviewReward',(select jsonb_build_object('percentOff',rw.percent_off,'minOrderIdr',rw.min_order_idr,'status',rw.status,'issuedAt',rw.issued_at,'redeemedAt',rw.redeemed_at) from private.customer_review_rewards rw where rw.source_order_id=o.id limit 1),
    'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name_snapshot,'variant',i.variant_size_snapshot,'quantity',i.quantity,'unitPriceIdr',i.unit_price_idr) order by i.created_at,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb)
  ) into v_result
  from public.orders o
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

-- Reviews follow the same universal tracking contract and close with the
-- tracking link 14 days after terminal completion.
create or replace function public.submit_order_review(
  p_tracking_id text,
  p_answers jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracking_id uuid;
  v_order public.orders%rowtype;
  v_review_id text:='review_'||replace(gen_random_uuid()::text,'-','');
  v_item jsonb;
  v_question private.review_questions%rowtype;
  v_active_count integer;
  v_reward_settings private.review_reward_settings%rowtype;
  v_reward_id text;
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
  perform private.consume_public_order_lookup_budget();
  begin v_tracking_id:=p_tracking_id::uuid; exception when invalid_text_representation then raise exception 'TRACKING_LINK_INVALID' using errcode='22023'; end;
  if jsonb_typeof(p_answers)<>'array' then raise exception 'REVIEW_ANSWERS_INVALID' using errcode='22023'; end if;
  if v_note is not null and length(v_note)>2000 then raise exception 'REVIEW_NOTE_TOO_LONG' using errcode='22023'; end if;

  select * into v_order
  from public.orders
  where public_tracking_id=v_tracking_id
    and (tracking_expires_at is null or tracking_expires_at > now())
  for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode='P0002'; end if;
  if v_order.status not in ('delivered','picked_up') then raise exception 'ORDER_NOT_COMPLETED' using errcode='22023'; end if;
  if v_order.customer_id is null then raise exception 'CUSTOMER_ID_REQUIRED' using errcode='22023'; end if;
  if exists(select 1 from private.order_reviews where order_id=v_order.id) then raise exception 'ORDER_ALREADY_REVIEWED' using errcode='23505'; end if;

  select count(*) into v_active_count from private.review_questions where is_active=true;
  if jsonb_array_length(p_answers)<>v_active_count then raise exception 'ALL_REVIEW_QUESTIONS_REQUIRED' using errcode='22023'; end if;

  insert into private.order_reviews(id,order_id,order_number,customer_id,note,submitted_at)
  values(v_review_id,v_order.id,v_order.order_number,v_order.customer_id,v_note,now());

  for v_item in select value from jsonb_array_elements(p_answers) loop
    select * into v_question from private.review_questions where id=v_item->>'questionId' and is_active=true;
    if not found then raise exception 'REVIEW_QUESTION_INVALID' using errcode='22023'; end if;
    if coalesce((v_item->>'score')::integer,0) not between 1 and 5 then raise exception 'REVIEW_SCORE_INVALID' using errcode='22023'; end if;
    insert into private.order_review_answers(review_id,question_id,question_snapshot,score)
    values(v_review_id,v_question.id,v_question.question,(v_item->>'score')::integer);
  end loop;

  select * into v_reward_settings from private.review_reward_settings where id='primary';
  if v_reward_settings.enabled then
    v_reward_id:='review_reward_'||replace(gen_random_uuid()::text,'-','');
    insert into private.customer_review_rewards(id,customer_id,source_order_id,source_review_id,percent_off,min_order_idr,status,issued_at)
    values(v_reward_id,v_order.customer_id,v_order.id,v_review_id,v_reward_settings.percent_off,v_reward_settings.min_order_idr,'available',now())
    on conflict(source_order_id) do nothing;
  end if;

  return jsonb_build_object(
    'reviewSubmitted',true,
    'reviewId',v_review_id,
    'reward',case when v_reward_id is null then null else jsonb_build_object('id',v_reward_id,'percentOff',v_reward_settings.percent_off,'minOrderIdr',v_reward_settings.min_order_idr,'status','available') end
  );
end;
$$;
revoke execute on function public.submit_order_review(text,jsonb,text) from public, authenticated;
grant execute on function public.submit_order_review(text,jsonb,text) to anon, service_role;

commit;
