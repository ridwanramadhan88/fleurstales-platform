-- Seed the shared Store records that the local builds already expose.
-- Without these rows, Storefront can display a local branch but the
-- authoritative checkout RPC correctly rejects it as unavailable.

begin;

insert into public.store_sync_state (id, revision)
values ('primary', 0)
on conflict (id) do nothing;

insert into public.store_profile (
  id, store_name, phone, whatsapp, email, address, currency, timezone
)
values (
  'primary',
  'Fleurstales Florist',
  '+62 812-0000-0000',
  '+62 812-0000-0000',
  'hello@fleurstales.com',
  'Lampung, Indonesia',
  'IDR',
  'Asia/Jakarta'
)
on conflict (id) do nothing;

insert into public.branches (
  id, name, code, address, phone, is_active, is_default,
  delivery_fee_idr, opening_hours, latitude, longitude, sort_order
)
values
(
  'Kedamaian', 'Kedamaian', 'KDM', '', '', true, true, 15000,
  jsonb_build_object(
    'monday', jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00'),
    'tuesday', jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00'),
    'wednesday', jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00'),
    'thursday', jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00'),
    'friday', jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00'),
    'saturday', jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00'),
    'sunday', jsonb_build_object('isOpen', true, 'opensAt', '07:00', 'closesAt', '16:00')
  ),
  -5.3971, 105.2668, 0
),
(
  'Pahoman', 'Pahoman', 'PHM', '', '', true, false, 15000,
  jsonb_build_object(
    'monday', jsonb_build_object('isOpen', true, 'opensAt', '10:00', 'closesAt', '19:00'),
    'tuesday', jsonb_build_object('isOpen', true, 'opensAt', '10:00', 'closesAt', '19:00'),
    'wednesday', jsonb_build_object('isOpen', true, 'opensAt', '10:00', 'closesAt', '19:00'),
    'thursday', jsonb_build_object('isOpen', true, 'opensAt', '10:00', 'closesAt', '19:00'),
    'friday', jsonb_build_object('isOpen', true, 'opensAt', '10:00', 'closesAt', '19:00'),
    'saturday', jsonb_build_object('isOpen', true, 'opensAt', '10:00', 'closesAt', '19:00'),
    'sunday', jsonb_build_object('isOpen', true, 'opensAt', '10:00', 'closesAt', '19:00')
  ),
  -5.4210, 105.2580, 1
)
on conflict (id) do nothing;

insert into public.public_payment_accounts (
  id, bank_name, account_number, account_holder, type,
  is_active, is_default, display_order, is_customer_visible, branch_ids
)
values (
  'bank-bca', 'BCA', '1234 5678 90', 'Fleurstales Florist', 'bank_transfer',
  true, true, 0, true, '{}'
)
on conflict (id) do nothing;

insert into public.storefront_payment_settings (id, payment_instructions)
values (
  'primary',
  'Please complete payment within 1 hour and keep your receipt. Our team will verify your payment and confirm the order shortly after.'
)
on conflict (id) do nothing;

commit;
