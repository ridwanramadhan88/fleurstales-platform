begin;

update public.store_profile
set phone = '',
    whatsapp = '',
    email = 'rdwnrmdhn88@gmail.com',
    address = '',
    updated_at = now()
where id = 'primary'
  and phone = '+62 812-0000-0000'
  and whatsapp = '+62 812-0000-0000'
  and email = 'hello@fleurstales.com';

update public.public_payment_accounts
set is_active = false,
    is_default = false,
    is_customer_visible = false,
    updated_at = now()
where id = 'bank-bca'
  and account_number = '1234 5678 90';

commit;
