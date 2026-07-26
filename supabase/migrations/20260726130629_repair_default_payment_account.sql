-- The production seed left the only payment account inactive, non-default,
-- and hidden. That makes the authoritative Store snapshot invalid and blocks
-- every OS staff session from completing production hydration.
update public.public_payment_accounts
set
  is_active = true,
  is_default = true,
  is_customer_visible = true,
  updated_at = now()
where id = 'bank-bca';
