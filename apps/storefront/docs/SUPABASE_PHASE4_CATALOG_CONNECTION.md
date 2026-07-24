# Supabase Phase 4 — Catalog Connection

Phase 4 connects the normalized Fleurstales Catalog contract to Supabase while preserving the existing seeded/local catalog as a fallback.

## Runtime behavior

### Online Store

- If Supabase runtime configuration is absent, the existing bundled catalog remains active.
- If Supabase is configured, the Storefront loads active occasions, active products, active variants, and product-image metadata before first render.
- An empty or failed remote response never replaces the bundled catalog.
- The Storefront refreshes the public Catalog when the browser window regains focus.
- Product-image rendering itself remains Phase 5; Phase 4 only carries remote image metadata into the Catalog model when present.

### Business Operational System

- The OS will not replace its full Catalog from an anonymous/public response.
- A Supabase staff access token is required before the OS hydrates inactive/private Catalog state.
- After an authenticated load, Catalog changes are debounced and sent through `replace_catalog_snapshot` as one transaction.
- The RPC uses an optimistic `catalog_sync_state.revision`. Stale writers receive `CATALOG_CONFLICT` instead of overwriting another device's edit.
- Permanent product deletion records its display product code in `catalog_product_code_tombstones` so future clients cannot reuse the retired identifier.
- Product variant cost data is never public. The OS requests it only for authenticated reads; the RPC changes costs only for the Owner role.

## Phase 4 migrations

Apply after `20260724163939_shared_core.sql`:

1. `20260724163946_catalog_sync.sql`
   - adds `products.sort_order`
   - adds Catalog sync revision state
   - adds deleted product-code tombstones
   - adds `get_catalog_admin_state()`
   - adds transactional `replace_catalog_snapshot(...)`

2. `20260724163957_catalog_seed.sql`
   - seeds 7 occasions
   - seeds 172 canonical products
   - seeds 175 variants
   - preserves the current Storefront product order
   - deliberately does not seed product images

## Runtime configuration

Both frontends continue to use browser-safe runtime config only:

```js
globalThis.__FLEURSTALES_CONFIG__ = {
  supabaseUrl: 'https://<project-ref>.supabase.co',
  supabasePublishableKey: '<publishable-key>',
}
```

Never place a Supabase secret/service-role key in either frontend.

## OS staff session boundary

The current Fleurstales OS sign-in still uses the prototype/local authentication flow. Phase 4 does not weaken Supabase RLS to work around that.

The Catalog bridge accepts the future Supabase Auth access token through:

```ts
setSupabaseAccessToken(accessToken)
```

and reads it through `browserSupabaseTokenProvider`. Until a valid staff token exists, the OS remains on its current local Catalog and remote writes stay disabled. This prevents an anonymous browser from receiving Owner/Admin Catalog privileges.

## Persistence during migration

The old operational snapshot still contains Catalog data during Phase 4. It is now treated as a cache/fallback rather than the intended final authority when Supabase Catalog is active. Phase 10 removes shared domains from the legacy snapshot after all shared connections are verified.
