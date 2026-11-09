-- D2 added tariff columns to public.branches and the storefront reads them
-- with the anon key, but anon only has column-level SELECT on branches.
-- Without these grants the branch list request is rejected (42501).
grant select (
  delivery_tariff_enabled, motor_base_idr, motor_included_km, motor_per_km_idr,
  car_base_idr, car_included_km, car_per_km_idr, max_delivery_km, motor_max_items
) on public.branches to anon;

notify pgrst, 'reload schema';
