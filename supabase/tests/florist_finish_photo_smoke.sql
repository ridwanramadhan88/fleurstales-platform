do $$
begin
  if to_regprocedure('private.can_write_order_finish_photo_object(text)') is null then
    raise exception 'Finish photo storage helper is missing';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='order_finish_photos_storage_insert'
                 and with_check like '%can_write_order_finish_photo_object%') then
    raise exception 'Finish photo insert policy must use the florist-aware helper';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='order_payment_proofs_storage_insert'
                 and with_check like '%can_write_order_media_object%'
                 and with_check not like '%finish_photo%') then
    raise exception 'Payment proof uploads must stay Owner/Admin only';
  end if;
  if has_function_privilege('authenticated','public.attach_order_finish_photo(text,integer,text,text)','EXECUTE') then
    raise exception 'Inner attach_order_finish_photo must not be directly callable by browser roles';
  end if;
end $$;
