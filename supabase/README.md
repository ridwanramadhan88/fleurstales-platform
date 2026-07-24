# Supabase directory

`migrations/20260724163939_shared_core.sql` is the canonical Phase 2 database migration for both Fleurstales builds.

Do not maintain divergent copies of the schema. This directory is the only
migration source used by both applications in the monorepo.

No production Supabase project credentials are stored here.

## Phase 4 Catalog connection

After the core migration, apply `20260724163946_catalog_sync.sql` and then `20260724163957_catalog_seed.sql`. See `docs/SUPABASE_PHASE4_CATALOG_CONNECTION.md` for runtime behavior and the authenticated OS write boundary.

## Phase 5 product images

`migrations/20260724164006_product_images.sql` extends `product_images` with MIME/size/dimension metadata and adds the revision-safe `replace_product_images_metadata` RPC used by the future Storage adapter. Product files remain in the public `product-images` bucket and mutations remain Owner/Admin-only.
## Phase 6 Store details

`migrations/20260724164007_store_sync.sql` adds the revision-safe public Store snapshot contract for profile, branches, opening hours, delivery fees, and customer-visible payment configuration. Private OS settings are excluded from the public projection.

## Phase 7 Customers / CRM

`migrations/20260724164009_customer_sync.sql` aligns TypeScript/Postgres WhatsApp identity normalization, adds customer revisions plus optimistic-concurrency Admin save/delete RPCs, and prepares Storefront checkout to preserve established CRM profiles while capturing missing fields as order-level suggestions. See `docs/SUPABASE_PHASE7_CUSTOMERS.md`.

## Later shared migrations

Apply the remaining migrations in filename order:

- `20260724164010_order_contract.sql`
- `20260724164011_auth_realtime_contract.sql`
- `20260724164012_size_guides.sql`
- `20260724164014_catalog_data_quality.sql`

Migration 010 repairs the reviewed mixed-Phalaenopsis starting price and
customer-facing name typos without changing any product or variant identity.
