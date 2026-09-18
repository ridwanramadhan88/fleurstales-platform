# Catalog PR 2 — Product Editor UI/UX + Draft Semantics

## Scope

This change rebuilds the Business OS Product Editor around local drafts and explicit variant configuration while keeping Supabase as the production source of truth.

## Product editor

- Main tabs: **Informasi Produk** and **Varian & Ukuran**.
- Header, tabs, content scroll area, and Save footer remain independently structured.
- Dirty state is shown per tab and at editor level.
- Closing a dirty editor requires confirmation.
- Browser navigation/reload receives an unsaved-changes guard.
- The editor keeps its local form draft if the source Product changes in another session; Save is blocked until the editor is reopened against the new source.

## Variant workflow

The assigned Size Template defines available slots only. A slot does not become a Product variant until the user chooses **Atur varian**, fills the nested editor, and selects **Terapkan**.

Existing production variants with no stable `sizeOptionId` remain visible under **Belum ditautkan ke ukuran**. They are never auto-linked, deleted, or silently rewritten.

A linked variant whose size is not present in the newly resolved template is kept visible as **Perlu ditinjau** and must be explicitly relinked before the server accepts the Product save.

D2 remains intentionally open, so the editor still permits an explicit unlinked variant when a Product cannot yet use a Size Template.

## Nested variant editor

The nested editor has **Detail | Foto | Resep** tabs. On mobile it uses the full dynamic viewport with safe-area padding. It owns a temporary child draft:

- **Terapkan** copies the child draft into the parent Product draft.
- **Batal** discards the child draft.
- Product Save is the only action that persists the parent draft remotely.
- Size Guide is reference-only.
- Cost stays Owner/Finance-only.
- Recipes remain internal production data.

## Save boundary

Database persistence is revision-atomic.

`public.replace_catalog_snapshot(bigint,jsonb,jsonb)` now writes Product fields, variants, Owner-authorized Cost changes, flower recipes, Product image metadata, variant image metadata, tombstones/deletes, and exactly one Catalog revision in one PostgreSQL transaction.

Image binaries are uploaded immediately before the database commit using new unique Storage paths. If the database commit fails or the revision is stale, newly uploaded objects are removed best-effort. Canceling the editor before Product Save never uploads draft images.

After a successful database commit, local data URLs are replaced with committed Storage public URLs. Removed old image objects are cleaned up best-effort after the metadata commit.

## Concurrency

The database snapshot uses `FOR UPDATE` on `catalog_sync_state` and rejects stale `baseRevision` with `CATALOG_CONFLICT`.

The open Product Editor also compares its source Product fingerprint with the live Catalog source. Remote refreshes therefore do not overwrite the draft, and a stale editor cannot silently save on top of a newly hydrated Product.

When switching which variant is sellable, new active variants are applied before old active variants are deactivated so the client-side active-Product invariant is never broken by an intermediate state.

## Verification required before merge

- Business OS full `npm run check`
- Storefront full `npm run check`
- global security / i18n / shared-parity contracts
- full local Supabase migration replay
- every SQL smoke test, including `catalog_product_editor_atomic_save_smoke.sql`
- final CI gate

No migration is applied manually to production in this PR.
