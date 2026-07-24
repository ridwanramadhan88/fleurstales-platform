# Canonical Shared Catalog — Phase 1

The Business OS and Online Store now use the same Catalog model and seed data.

Canonical catalog baseline:
- 172 master products
- 175 size/price variants
- 7 configured occasions: Birthday, Anniversary, General Gifting, Condolence, Congratulations, Graduation, Wedding
- Anniversary is intentionally configured with no products yet
- Occasion Tags support products appearing in multiple customer-facing occasion routes
- Arrangement Type is stored in `productType`
- Collection / Series is stored separately in `collectionSeries`
- Pricing Type supports `Fixed` and `Starts From`
- Order Type supports `Catalog` and `Custom`
- Thumbnail/gallery remain part of the Catalog product contract; image storage itself moves to Supabase Storage in Phase 5
- Product IDs and SKUs are unique in the canonical seed

CSV import/export now preserves the shared catalog metadata while remaining compatible with the legacy Category / Material / Product Name / Size / Price format.

Operational schema version 24 hydrates both applications onto this same canonical catalog while preserving the other operational slices. Shared snapshot persistence is temporary and will be replaced domain-by-domain by Supabase in later phases.
