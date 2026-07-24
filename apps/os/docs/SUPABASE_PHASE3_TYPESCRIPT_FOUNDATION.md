# Supabase Phase 3 — TypeScript shared-data foundation

Phase 3 deliberately does **not** switch any current screen or Zustand store to Supabase.
It establishes a common contract that both Fleurstales OS and the Online Store can use in later phases.

## Source location

`src/data/shared/`

- `databaseTypes.ts` — canonical TypeScript representation of the Phase 2 SQL schema.
- `contracts.ts` — app-facing shared data DTOs in camelCase.
- `supabaseConfig.ts` — browser-safe environment configuration.
- `supabaseHttpClient.ts` — dependency-free PostgREST/RPC transport used until the official SDK is installed.
- `repositoryContracts.ts` — read/admin/checkout repository boundaries.
- `repositories.ts` — initial Catalog read, Store read and Storefront checkout implementations.
- `index.ts` — public barrel.

## Runtime configuration

The current project uses a custom esbuild pipeline rather than Vite env injection. Browser-safe values are therefore supplied through:

```js
globalThis.__FLEURSTALES_CONFIG__ = {
  supabaseUrl: 'https://<project>.supabase.co',
  supabasePublishableKey: '<public publishable key>',
}
```

Never place a Supabase service-role or secret key in either frontend build.

## Current behavior

No existing UI imports `src/data/shared` yet. Existing local operational persistence remains active until its corresponding migration phase.

## SDK handoff

This environment currently has no `@supabase/supabase-js` package and cannot reach npm. The transport is therefore intentionally isolated behind repository contracts. When a live project/package install is available, the transport can be replaced with the official SDK without changing the UI-facing repository contracts.

## Phase 4 handoff

Phase 4 connects the Catalog first:

1. hydrate the current Catalog store from `CatalogReadRepository`;
2. add authenticated catalog mutation implementations for OS;
3. keep Storefront read-only under RLS;
4. preserve local catalog data only as a migration/fallback until Supabase data is verified;
5. move image read/write handling to Storage in Phase 5.
