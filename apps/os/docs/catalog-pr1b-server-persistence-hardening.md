# Catalog PR 1B — Server & Persistence Hardening

## Purpose

PR 1B moves Catalog privacy and integrity rules from UI-only behavior into the shared repository and Supabase mutation boundary.

## Production audit before implementation

Read-only checks against the production Supabase project found:

- `product_variant_flower_recipes`: 39 live recipe rows.
- `product_variant_costs`: 0 current Cost rows.
- Size Templates: 2.
- Size Template targets: 172 before the PR 1A migration is released.
- Active variants: 174.
- Inactive variants: 3.
- Active variants with non-positive price: 0.
- Minimum active variant price: Rp27.000.

### Privacy findings

Before PR 1B:

- `product_variant_flower_recipes` granted SELECT to `anon`.
- A public RLS policy exposed recipes for active products/variants.
- the shared public Catalog repository queried recipe rows on every Product read.
- Cost RLS followed Finance-section access, which excluded Owner and did not match the agreed Owner + Finance visibility model.

## Changes

### Live recipe privacy

- Storefront/public Catalog reads no longer query live recipe rows.
- anon SELECT on `product_variant_flower_recipes` is revoked.
- live recipe RLS is limited to Owner/Admin staff.
- the existing Order `flower_recipe_snapshot` trigger remains the production-time historical recipe source.

### Cost privacy

Cost read access is enforced server-side for:

- Owner: allowed
- Finance: allowed
- Admin: denied
- HR: denied
- Florist: denied

Admin Catalog saves preserve existing Cost rows because only Owner is allowed to mutate Cost through the Catalog snapshot RPC.

### Catalog invariants

The server mutation boundary rejects:

- active Product without a sellable variant,
- active/sellable variant with price <= 0,
- duplicate non-null `sizeOptionId` within one Product,
- stable size identity without a resolved explicit template,
- stable size identity missing from the resolved template,
- active variant linked to an archived size.

The table also has a CHECK constraint preventing active zero/negative-price variants even outside the browser RPC path.

### Size Template replacement

The Size Template RPC rejects:

- duplicate child IDs within one template,
- removing a child still referenced by a historical variant,
- removing the target required by a linked variant,
- archiving a child used by an active/sellable variant.

Inactive historical variants may continue referencing an archived child.

### Production persistence

When Supabase configuration is present, browser localStorage is not used as authoritative Size Template persistence:

- stale size-guide localStorage is removed/ignored,
- production writes do not update the local size-guide cache,
- Storefront startup already fails closed if remote Catalog hydration fails,
- Business OS production login already refuses to open if Catalog hydration fails.

Local/demo mode keeps browser persistence.

## Release behavior

This PR does not apply migrations directly to production. The new migration is applied only through the normal production release/migration workflow.

## Verification

Required before merge:

- shared parity
- security contracts
- Business OS full check
- Storefront full check
- full Supabase migration replay
- every SQL smoke test
- CI gate
