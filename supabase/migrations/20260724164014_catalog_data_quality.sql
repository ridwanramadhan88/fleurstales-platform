-- Repair confirmed catalog import corruption and unambiguous display-name typos.
-- Product and variant identities remain unchanged so existing orders and links
-- continue to resolve.

update public.product_variants
set price_idr = 1100000,
    updated_at = now()
where id = 'catalog_mix_phalaenopsis_bridal_bouquet_163_variant_1'
  and price_idr <> 1100000;

update public.products
set name = corrections.name,
    updated_at = now()
from (
  values
    ('catalog_single_artifical_003', 'Single Artificial'),
    ('catalog_pink_garbera_057', 'Pink Gerbera'),
    ('catalog_raibow_giant_097', 'Rainbow Giant'),
    ('catalog_fuschia_lily_111', 'Fuchsia Lily'),
    ('catalog_anmber_awe_121', 'Amber Awe'),
    ('catalog_mostly_lilies_139', 'Mostly Lilies'),
    ('catalog_standard_white_141', 'Standard White'),
    ('catalog_standard_stand_142', 'Standard Stand'),
    ('catalog_double_stand_143', 'Double Stand'),
    ('catalog_pink_angel_144', 'Pink Angel'),
    ('catalog_double_red_146', 'Double Red'),
    ('catalog_purple_peace_147', 'Purple Peace'),
    ('catalog_standard_roses_bouquet_168', 'Standard Roses Bouquet'),
    ('catalog_posy_bouquet_169', 'Posy Bouquet')
) as corrections(id, name)
where public.products.id = corrections.id
  and public.products.name <> corrections.name;
