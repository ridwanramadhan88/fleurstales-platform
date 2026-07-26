begin;

-- Retire the compatibility helper that reintroduced personal-email matching.
-- First-owner provisioning remains governed by trusted app_metadata through
-- private.bootstrap_fleurstales_owner_from_app_metadata().
drop function if exists private.bootstrap_fleurstales_owner_profile();

commit;
