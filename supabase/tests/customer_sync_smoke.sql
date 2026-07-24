-- Run after migrations through 20260724164009_customer_sync.sql on a Supabase/Postgres project.
do $$
begin
  if private.normalize_whatsapp('0812 3456 7890') <> '6281234567890' then
    raise exception 'Local-format WhatsApp normalization failed';
  end if;
  if private.normalize_whatsapp('+62 812-3456-7890') <> '6281234567890' then
    raise exception 'Country-code WhatsApp normalization failed';
  end if;
  if private.normalize_whatsapp('0062 812 3456 7890') <> '6281234567890' then
    raise exception '0062 WhatsApp normalization failed';
  end if;
  if private.normalize_whatsapp('62081234567890') <> '6281234567890' then
    raise exception '620 WhatsApp normalization failed';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customers' and column_name = 'revision'
  ) then raise exception 'customers.revision is missing'; end if;

  if to_regprocedure('public.save_customer_profile(jsonb,bigint)') is null then
    raise exception 'save_customer_profile RPC is missing';
  end if;
  if to_regprocedure('public.delete_customer_profile(text,bigint)') is null then
    raise exception 'delete_customer_profile RPC is missing';
  end if;
end $$;
