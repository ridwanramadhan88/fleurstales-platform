# Phase 10 — Shared-data migration and local parity QA

Phase 10 does **not** require a Supabase project. It gives Business OS and the
Online Store one portable shared-data format for Catalog, Store Details,
Customers/CRM, and Orders.

## Portable bundle

`SharedDataBundleV1` is intentionally separate from `operationalPersistence`.
It excludes HR, payroll, finance configuration, permissions, UI state, and all
other OS-only state.

A bundle contains:

- Catalog: occasions, products, variants, image metadata, cost data, tombstones,
  and the optimistic catalog revision.
- Store: public store profile, branches, opening hours, delivery fees, public
  payment accounts/instructions, and the optimistic store revision.
- Customers: canonical CRM profiles plus explicit saved addresses.
- Orders: immutable order/customer/item snapshots and the shared order fields.

Every exported JSON file is wrapped in an envelope with an FNV-1a fingerprint.
The fingerprint covers only the four shared domains (including their shared
revision state), not `exportedAt`, source app/version, or notes. Therefore an OS
export and Storefront export of identical shared data compare as identical even
when created at different times. It is for deterministic parity/corruption
checks, **not** for security or authentication.

## Runtime export/import

Use:

- `buildSharedDataBundleFromLocalStores(...)`
- `serializeSharedDataBundle(bundle)`
- `parseSharedDataBundle(json)`
- `applySharedDataBundleToLocalStores(bundle)`

Import validates all four domains first and captures an automatic rollback
snapshot. If any local apply step fails, the original shared state is restored.

Historical Orders are allowed to reference retired/deleted Catalog or CRM rows
because their immutable snapshots remain meaningful. Those are warnings, not
hard import failures.

## Local simulation

`createSharedDataSimulation(bundle)` creates an in-memory repository-backed hub.
It supports the same Catalog/Store/Customer/Order repository contracts needed
for cross-build QA, including optimistic revision conflicts for Catalog, Store,
and Customer writes.

This is the Phase 11 test substrate. Both apps can start from the exact same
bundle fingerprint without pretending a remote backend exists.

## Future Supabase import

`buildSupabaseSharedImportPlan(bundle)` converts the portable bundle into
row-shaped data matching the prepared Supabase tables. It performs no network
or database writes. Actual inserts/upserts remain deferred until a real
Supabase project exists.

Product image binaries are not embedded as a separate object store. Current
local data URLs may appear as temporary public URLs in a bundle; Phase 12 will
materialize those through the prepared Storage upload path before final metadata
is inserted.

## CLI

Validate a bundle:

```bash
node scripts/shared-data-bundle-cli.mjs validate shared-data/fixtures/shared-data-bundle-v1.json
```

Summarize:

```bash
node scripts/shared-data-bundle-cli.mjs summary path/to/bundle.json
```

Compare two exports byte-independently by canonical fingerprint:

```bash
node scripts/shared-data-bundle-cli.mjs compare os-export.json storefront-export.json
```

The two files are considered equivalent when their canonical data fingerprint
matches; JSON property ordering and indentation do not matter.
