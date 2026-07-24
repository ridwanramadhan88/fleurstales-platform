# Fleurstales Supabase Shared Data Architecture

Phase 2 defines the backend contract shared by **Fleurstales Business OS** and the **Online Store**. No UI data source is switched in this phase.

## Canonical shared domains

1. **Catalog** — occasions, products, variants, product images, private variant costs.
2. **Store details** — store identity, branches/opening hours/delivery fee, public payment accounts/instructions.
3. **Customers / CRM** — canonical customer identity keyed by normalized WhatsApp; internal notes remain private.
4. **Orders** — transactional order header, immutable item/customer snapshots, payment events, activity timeline, branch/year order sequence.

## Access boundary

| Data | Storefront (anon) | Business OS |
|---|---|---|
| Active catalog | Read | Read; Owner/Admin write |
| Variant cost | No access | Owner/Finance |
| Store profile | Read | Owner write |
| Active branches | Public columns only | Staff read; Owner write |
| Public payment info | Read visible/active only | Owner manages |
| Customers / CRM | No direct access | Owner/Admin |
| Orders | No direct table access | Staff read; Owner/Admin/Finance mutation boundary |
| Create Storefront order | Restricted RPC | Also callable, but OS will use internal repositories |

The Storefront cannot enumerate customers, read CRM notes, directly insert an order, or submit its own price/total. `create_storefront_order(...)` is the only public write entry point for the Phase 2 shared core.

## Important implementation decisions

### Keep existing text IDs
Existing catalog/order/customer IDs are not real UUIDs (for example `catalog_petite_rainbow_001`). The database therefore keeps these identifiers as `text` primary keys. New database-generated IDs use compatible prefixed strings.

### Cost is physically private
`product_variants` contains the Storefront-safe sell price. Cost lives in `product_variant_costs`, which has no anonymous privilege or policy.

### Multi-occasion products
`products.primary_occasion_id` preserves the primary Occasion/category. `product_occasions` stores all customer-facing occasion tags.

### Historical snapshots
Orders link to current `customer_id`, `product_id`, and `variant_id`, while also storing immutable names/contact/SKU/size/price snapshots. Editing CRM or Catalog later cannot rewrite historical order facts.

### Customer matching
`normalized_whatsapp_number` is unique. The checkout RPC normalizes common Indonesian `08...` numbers to `62...`. Existing CRM names are preserved. Storefront email/birthday/preferred branch only fill missing CRM fields.

### Transactional checkout
`create_storefront_order(...)` performs one Postgres transaction:

1. Idempotency lookup.
2. Customer/WhatsApp validation.
3. Active branch and opening-hour validation.
4. Customer find/create/fill-empty-fields.
5. Product + variant validation.
6. Database-side sell-price calculation.
7. Database-side delivery-fee calculation.
8. Atomic branch/year order-number allocation.
9. Order + immutable order items insert.
10. Activity timeline insert.

The browser never supplies an authoritative `unitPriceIdr`, subtotal, delivery fee, discount, or total.

### Realtime
The shared tables are added to `supabase_realtime`. Phase 9 will decide which subscriptions each client actually opens. The first required subscription is Business OS listening for new/updated orders.

### Storage
Two public-read buckets are declared:

- `product-images`: max 100 KB, JPEG/PNG/WebP; Owner/Admin write.
- `store-assets`: max 1 MB, common image/SVG formats; Owner write.

Public buckets are intentional because these assets are storefront content. Mutation still requires Storage RLS.

## Tables

### Access
- `staff_access_profiles`

### Store
- `store_profile`
- `branches`
- `public_payment_accounts`
- `storefront_payment_settings`

### Catalog
- `occasions`
- `products`
- `product_occasions`
- `product_variants`
- `product_variant_costs`
- `product_images`

### CRM
- `customers`
- `customer_addresses`

### Orders
- `order_sequences`
- `orders`
- `order_items`
- `order_payment_events`
- `order_activities`

## Intentionally not moved in Phase 2

These remain Business-OS-only and are not part of the public shared contract:

- Payroll
- Attendance
- Scheduling
- HR employee records
- Permission matrix
- Inventory
- Finance ledger
- Notifications
- Vouchers/customer segmentation rules

Some of these can still derive information from shared Orders later.

## Phase 3 handoff

Phase 3 should add the Supabase client and one shared TypeScript database/data-contract layer to both apps. It should not duplicate Supabase calls inside components. Repositories will be introduced for catalog, store, customer, and orders, with Zustand remaining the UI state/cache layer during the transition.

## Deployment notes for the real Supabase project

- The migration is prepared locally but **has not been applied to a remote Supabase project yet**; no project URL/key was provided in this phase.
- The first `staff_access_profiles` Owner row must be bootstrapped from the Supabase SQL Editor/service context after that Owner account exists in Supabase Auth. Afterward, the Owner RLS policy can manage staff access mappings.
- When historical orders are imported later, Phase 13 must initialize `order_sequences.last_sequence` from the highest existing order number for each branch/year before public checkout is enabled.
- The public checkout RPC is deliberately narrow and idempotent, but a production public storefront should still add abuse protection/rate limiting at the edge if order spam becomes a concern.
